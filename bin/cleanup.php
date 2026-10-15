<?php
// Deletes every game created more than 72 hours ago, with everything under
// it. firestore.rules lets anyone delete expired games, so this uses the
// Firestore REST API with no credentials. Run hourly from cron:
//
//   FIREBASE_PROJECT_ID=my-project php bin/cleanup.php
//
// Set FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 to run against the emulator.
// PHP 7.2 compatible.

const TTL_SECONDS = 72 * 3600;
const SUBCOLLECTIONS = ['subs', 'rosters', 'editors'];

$project = getenv('FIREBASE_PROJECT_ID') ?: (isset($argv[1]) ? $argv[1] : '');
if ($project === '') {
    fwrite(STDERR, "usage: FIREBASE_PROJECT_ID=<id> php bin/cleanup.php\n");
    exit(2);
}
$emulator = getenv('FIRESTORE_EMULATOR_HOST');
$api = ($emulator ? 'http://' . $emulator : 'https://firestore.googleapis.com') . '/v1/';
$root = 'projects/' . $project . '/databases/(default)/documents';

function call($method, $url, $body = null)
{
    $ch = curl_init($url);
    $opts = [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    ];
    if ($body !== null) {
        $opts[CURLOPT_POSTFIELDS] = json_encode($body);
    }
    curl_setopt_array($ch, $opts);
    $response = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    if ($status === 404 && $method !== 'POST') {
        return null;
    }
    if ($response === false || $status >= 300) {
        throw new RuntimeException("$method $url -> HTTP $status " . substr((string) $response, 0, 300));
    }

    return json_decode($response, true);
}

function list_docs($api, $parent, $collection)
{
    $names = [];
    $token = '';
    do {
        $url = $api . $parent . '/' . $collection . '?pageSize=300' . ($token !== '' ? '&pageToken=' . urlencode($token) : '');
        $page = call('GET', $url);
        foreach ((isset($page['documents']) ? $page['documents'] : []) as $d) {
            $names[] = $d['name'];
        }
        $token = isset($page['nextPageToken']) ? $page['nextPageToken'] : '';
    } while ($token !== '');

    return $names;
}

$cutoff = gmdate('Y-m-d\TH:i:s\Z', time() - TTL_SECONDS);
$results = call('POST', $api . $root . ':runQuery', [
    'structuredQuery' => [
        'from' => [['collectionId' => 'games']],
        'where' => ['fieldFilter' => [
            'field' => ['fieldPath' => 'createdAt'],
            'op' => 'LESS_THAN',
            'value' => ['timestampValue' => $cutoff],
        ]],
        'limit' => 500,
    ],
]);

$deleted = 0;
$failed = 0;
foreach ($results as $row) {
    if (!isset($row['document']['name'])) {
        continue;
    }
    $game = $row['document']['name'];
    try {
        foreach (SUBCOLLECTIONS as $sub) {
            foreach (list_docs($api, $game, $sub) as $name) {
                call('DELETE', $api . $name);
            }
        }
        $secret = call('GET', $api . $game . '/secret/code');
        $code = isset($secret['fields']['code']['stringValue']) ? $secret['fields']['code']['stringValue'] : '';
        call('DELETE', $api . $game . '/secret/code');
        if ($code !== '') {
            call('DELETE', $api . $root . '/codes/' . $code);
        }
        // The game doc goes last: the rules check its createdAt to allow
        // every delete above.
        call('DELETE', $api . $game);
        $deleted++;
    } catch (RuntimeException $e) {
        fwrite(STDERR, 'cleanup: ' . $e->getMessage() . "\n");
        $failed++;
    }
}

if ($deleted || $failed) {
    echo "cleanup: deleted $deleted expired game(s)" . ($failed ? ", $failed failed" : '') . "\n";
}
exit($failed ? 1 : 0);
