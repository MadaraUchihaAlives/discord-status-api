$base = "https://s3508.bom1.stableserver.net:2083"
$user = "simonsre"
$token = "A916Z1QHXKJDF5SVUMZMGQ1SJHJCJKF9"
$localRoot = "C:\Users\nabee\Downloads\xd-sms-gateway\cpanel"
$remoteDir = "/home/simonsre/sms.luffyxd.store"
$auth = "Authorization: cpanel $user`:$token"

$files = Get-ChildItem $localRoot -Recurse -File
$total = $files.Count
$i = 0
foreach ($f in $files) {
  $i++
  $rel = $f.FullName.Substring($localRoot.Length + 1).Replace('\', '/')
  $remoteFile = "$remoteDir/$rel"
  $remoteParent = Split-Path $remoteFile -Parent
  $upUrl = "$base/execute/Fileman/upload_files"
  $res = curl.exe -s -k -H $auth -F "dir=$remoteParent" -F "overwrite=1" -F "file-1=@$($f.FullName)" $upUrl
  $ok = $res -match '"succeeded":1'
  Write-Output ("[{0}/{1}] {2} -> {3}" -f $i, $total, $rel, $(if($ok){"OK"}else{"FAIL: $res"}))
}
Write-Output "DONE. Processed $total files."
