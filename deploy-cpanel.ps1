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

  # ensure parent dir exists
  curl.exe -s -k -H $auth --data-urlencode "path=$remoteParent" "$base/execute/Fileman/mkdir" > $null 2>&1

  # delete existing remote file if present
  curl.exe -s -k -H $auth "$base/json-api/cpanel?cpanel_jsonapi_module=Fileman&cpanel_jsonapi_func=fileop&cpanel_jsonapi_apiversion=2&op=delete&dir=$remoteParent&file-1=$(Split-Path $remoteFile -Leaf)" > $null 2>&1

  # upload
  $res = curl.exe -s -k -H $auth -F "dir=$remoteParent" -F "file-1=@$($f.FullName)" "$base/execute/Fileman/upload_files"
  $ok = $res -match '"succeeded":1'
  Write-Output ("[{0}/{1}] {2} -> {3}" -f $i, $total, $rel, $(if($ok){"OK"}else{"FAIL: $res"}))
}
Write-Output "DONE. Uploaded $total files."
