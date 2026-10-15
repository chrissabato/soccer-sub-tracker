<?php
// Fetches a school's public roster page so the browser can parse it.
// Browsers can't read Sidearm/Presto pages directly (CORS), so this is the
// one piece of server work in roster import; parsing happens client-side.
//
// GET api/fetch-roster.php?url=https://example.edu/sports/womens-soccer/roster
//   200 {"html": "...", "url": "<final url after redirects>"}
//   4xx/5xx {"error": "...", "blocked": true|false}
//
// SSRF guards ported from pa-script src/Roster/RosterPageFetcher.php: only
// public http(s) hosts on standard ports, every hop's DNS checked against
// private/reserved ranges and curl pinned to the vetted IP, redirects
// followed by hand. On top of that, the first hop must be a school's
// athletics domain from data/schools.json (kept fresh by
// bin/refresh-schools.php), so this can't be used as an open proxy, and
// each IP gets a small request budget. PHP 7.2 compatible.

const MAX_REDIRECTS = 5;
const MAX_BYTES = 8388608;
const TIMEOUT_SECONDS = 20;
const RATE_LIMIT = 30;          // requests...
const RATE_WINDOW = 600;        // ...per this many seconds, per IP
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const SCHOOLS_FILE = __DIR__ . '/../../data/schools.json';

class FetchError extends Exception
{
    public $status;
    public $blocked;

    public function __construct($message, $status = 422, $blocked = false)
    {
        parent::__construct($message);
        $this->status = $status;
        $this->blocked = $blocked;
    }
}

function respond($status, array $body)
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function rate_limit($ip)
{
    $file = sys_get_temp_dir() . '/soccer-sub-rl-' . md5($ip);
    $now = time();
    $fh = @fopen($file, 'c+');
    if (!$fh) {
        return; // Can't track; don't block real users over it.
    }
    flock($fh, LOCK_EX);
    $hits = array_filter(
        array_map('intval', explode(',', (string) stream_get_contents($fh))),
        function ($t) use ($now) {
            return $t > $now - RATE_WINDOW;
        }
    );
    if (count($hits) >= RATE_LIMIT) {
        flock($fh, LOCK_UN);
        fclose($fh);
        throw new FetchError('Too many roster fetches from your network. Wait a few minutes, or paste the roster instead.', 429);
    }
    $hits[] = $now;
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, implode(',', $hits));
    flock($fh, LOCK_UN);
    fclose($fh);
}

// Bare host of each school's athletics site, without "www.".
function school_domains()
{
    $json = @file_get_contents(SCHOOLS_FILE);
    $schools = $json === false ? null : json_decode($json, true);
    if (!is_array($schools)) {
        throw new FetchError('Roster import is not set up on this server (missing data/schools.json; run bin/refresh-schools.php).', 503);
    }
    $domains = [];
    foreach ($schools as $s) {
        $host = strtolower((string) parse_url(isset($s['url']) ? $s['url'] : '', PHP_URL_HOST));
        if ($host !== '') {
            $domains[preg_replace('/^www\./', '', $host)] = true;
        }
    }

    return $domains;
}

function host_allowed($host, array $domains)
{
    $host = preg_replace('/^www\./', '', strtolower($host));
    // Accept the domain itself or any subdomain of it.
    while ($host !== '' && strpos($host, '.') !== false) {
        if (isset($domains[$host])) {
            return true;
        }
        $host = substr($host, strpos($host, '.') + 1);
    }

    return false;
}

// @return array [host, port, ip]
function vet($url)
{
    $parts = parse_url($url);
    $scheme = strtolower(isset($parts['scheme']) ? $parts['scheme'] : '');
    $host = strtolower(isset($parts['host']) ? $parts['host'] : '');
    if (!in_array($scheme, ['http', 'https'], true) || $host === '') {
        throw new FetchError('Enter a full http(s):// roster URL.');
    }
    if (isset($parts['user']) || isset($parts['pass'])) {
        throw new FetchError('Roster URLs cannot contain a username or password.');
    }
    $port = (int) (isset($parts['port']) ? $parts['port'] : ($scheme === 'https' ? 443 : 80));
    if (!in_array($port, [80, 443], true)) {
        throw new FetchError('Roster URLs must use the standard web ports.');
    }
    $ips = filter_var($host, FILTER_VALIDATE_IP) ? [$host] : (gethostbynamel($host) ?: []);
    if ($ips === []) {
        throw new FetchError('Could not find the site ' . $host . '.');
    }
    foreach ($ips as $ip) {
        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            throw new FetchError('That URL points at a private address; only public sites can be fetched.');
        }
    }

    return [$host, $port, $ips[0]];
}

// @return array [status, headers, body]
function request($url, $host, $port, $ip)
{
    $headers = [];
    $body = '';
    $tooBig = false;

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RESOLVE => [$host . ':' . $port . ':' . $ip],
        CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => TIMEOUT_SECONDS,
        CURLOPT_ENCODING => '',
        CURLOPT_USERAGENT => USER_AGENT,
        CURLOPT_HTTPHEADER => [
            'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language: en-US,en;q=0.9',
        ],
        CURLOPT_HEADERFUNCTION => function ($ch, $line) use (&$headers) {
            $pos = strpos($line, ':');
            if ($pos !== false) {
                $headers[strtolower(trim(substr($line, 0, $pos)))] = trim(substr($line, $pos + 1));
            }

            return strlen($line);
        },
        CURLOPT_WRITEFUNCTION => function ($ch, $chunk) use (&$body, &$tooBig) {
            if (strlen($body) + strlen($chunk) > MAX_BYTES) {
                $tooBig = true;

                return 0;
            }
            $body .= $chunk;

            return strlen($chunk);
        },
    ]);

    $ok = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($tooBig) {
        throw new FetchError('That page is too large to be a roster page.');
    }
    if ($ok === false) {
        throw new FetchError('Could not reach ' . $host . ': ' . $error, 502);
    }

    return [$status, $headers, $body];
}

function resolve_redirect($from, $location)
{
    if (preg_match('#^https?://#i', $location)) {
        return $location;
    }
    $parts = parse_url($from);
    $origin = $parts['scheme'] . '://' . $parts['host'] . (isset($parts['port']) ? ':' . $parts['port'] : '');
    if (strpos($location, '//') === 0) {
        return $parts['scheme'] . ':' . $location;
    }
    if (strpos($location, '/') === 0) {
        return $origin . $location;
    }
    $dir = preg_replace('#/[^/]*$#', '/', isset($parts['path']) ? $parts['path'] : '/');

    return $origin . $dir . $location;
}

function fetch_page($url)
{
    for ($hop = 0; $hop <= MAX_REDIRECTS; $hop++) {
        list($host, $port, $ip) = vet($url);
        list($status, $headers, $body) = request($url, $host, $port, $ip);

        if ($status >= 300 && $status < 400 && isset($headers['location'])) {
            $url = resolve_redirect($url, $headers['location']);
            continue;
        }
        if (isset($headers['x-amzn-waf-action']) || ($status === 202 && trim($body) === '')) {
            throw new FetchError($host . ' blocked the request with a bot check. Paste the roster as a list instead.', 502, true);
        }
        if ($status === 403 || $status === 429) {
            throw new FetchError($host . ' refused the request (HTTP ' . $status . '). Paste the roster as a list instead.', 502, true);
        }
        if ($status === 404) {
            throw new FetchError($host . ' has no page at that URL (HTTP 404). Check the roster URL.', 404);
        }
        if ($status !== 200) {
            throw new FetchError($host . ' returned HTTP ' . $status . ' for that URL. Check it is the roster page.', 502);
        }

        return ['html' => $body, 'url' => $url];
    }

    throw new FetchError('Too many redirects.', 502);
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        throw new FetchError('GET only.', 405);
    }
    if (!function_exists('curl_init')) {
        throw new FetchError('The server is missing the PHP curl extension.', 500);
    }
    $url = trim(isset($_GET['url']) ? (string) $_GET['url'] : '');
    if ($url === '' || strlen($url) > 500) {
        throw new FetchError('Enter a roster URL.');
    }
    $host = strtolower((string) parse_url($url, PHP_URL_HOST));
    if ($host === '' || !host_allowed($host, school_domains())) {
        throw new FetchError('Only roster pages on a school athletics site in the directory can be fetched. Paste the roster as a list instead.', 403);
    }
    rate_limit(isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '');
    respond(200, fetch_page($url));
} catch (FetchError $e) {
    respond($e->status, ['error' => $e->getMessage(), 'blocked' => $e->blocked]);
}
