$hf_dir = "e:\Drizzle\VS\hf_space_v4"
$backend_dir = "e:\Drizzle\VS\firewall\backend"

# Remove existing files in HF repo except .git, README.md, models
Get-ChildItem -Path $hf_dir -Force | Where-Object { $_.Name -notin @('.git', 'README.md', '.gitattributes', 'models') } | Remove-Item -Recurse -Force

# Copy files from backend to HF repo excluding models and venv
Get-ChildItem -Path $backend_dir -Force | Where-Object { $_.Name -notin @('models', 'venv', '__pycache__') } | Copy-Item -Destination $hf_dir -Recurse -Force

# Git operations
Set-Location $hf_dir
git add .
git commit -m "chore: sync updated backend to HF"
git push
