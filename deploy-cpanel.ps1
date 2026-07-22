$base = "https://s3508.bom1.stableserver.net:2083"
$user = "simonsre"
$token = "A916Z1QHXKJDF5SVUMZMGQ1SJHJCJKF9"
$localRoot = "C:\Users\nabee\Downloads\xd-sms-gateway\cpanel"
$remoteDir = "/home/simonsre/sms.luffyxd.store"
$auth = "Authorization: cpanel $user`:$token"

$htmlFiles = Get-ChildItem $localRoot -Recurse -Filter "*.html"
Write-Output "Deleting old .html files from server..."
foreach ($f in $htmlFiles) {
  $rel = $f.FullName.Substring($localRoot.Length + 1).Replace('\', '/')
  $remoteFile = "$remoteDir/$rel"
  $remoteParent = Split-Path $remoteFile -Parent
  $fileName = Split-Path $remoteFile -Leaf
  $delUrl = "$base/json-api/cpanel?cpanel_jsonapi_module=Fileman&cpanel_jsonapi_func=fileop&cpanel_jsonapi_apiversion=2&op=delete&dir=$remoteParent&file-1=$fileName"
  curl.exe -s -k -H $auth $delUrl > $null 2>&1
}

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
