Windows Testing Tips
- Background tasks (start /b):
  - Example: start "" /B npm run test:e2e
- Parallelize tests in Windows shell:
  - Use multiple start /b commands for independent tasks
- PowerShell alternatives:
  - Start-Process -FilePath "pwsh" -ArgumentList "-NoProfile", "-Command", "npm run test:e2e" -WindowStyle Hidden
- Ensure console feedback is captured by redirecting output: start "" /B cmd /c "npm run test:e2e > output.log 2>&1"
