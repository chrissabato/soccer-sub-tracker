<?php
// Downloads schools.json (college-athletics-directory) to data/, where
// public/api/fetch-roster.php reads its allowlist of athletics domains.
// Run once at install, then daily from cron. PHP 7.2 compatible.

$source = 'https://raw.githubusercontent.com/chrissabato/college-athletics-directory/main/schools.json';
$target = __DIR__ . '/../data/schools.json';

$ch = curl_init($source);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_TIMEOUT => 60,
]);
$body = curl_exec($ch);
$status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
curl_close($ch);

$schools = $body === false ? null : json_decode($body, true);
if ($status !== 200 || !is_array($schools) || count($schools) < 100) {
    fwrite(STDERR, "refresh-schools: download failed (HTTP $status); keeping the existing file.\n");
    exit(1);
}

// Write-then-rename so the proxy never reads a half-written file.
$tmp = $target . '.tmp';
file_put_contents($tmp, $body);
rename($tmp, $target);
echo 'refresh-schools: ' . count($schools) . " schools\n";
