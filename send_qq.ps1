$body = @{user_id=2674610176; message="修复桌面端拖动bug - 代码已推送"} | ConvertTo-Json -Compress
Invoke-RestMethod -Uri "http://localhost:3000/send_private_msg" -Method Post -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($body))
