import os
import shutil
import subprocess

def deploy_hf():
    print("Cloning fresh copy to hf_space_v3...")
    subprocess.run(["git", "clone", "https://huggingface.co/spaces/imDrizzle/lurien-matrix-firewall", "hf_space_v3"], cwd="e:/Drizzle/VS", check=True)
    
    hf_dir = "e:/Drizzle/VS/hf_space_v3"
    backend_dir = "e:/Drizzle/VS/firewall/backend"
    
    print("Clearing old files in HF repo...")
    for item in os.listdir(hf_dir):
        if item not in [".git", ".gitattributes", "README.md"]:
            path = os.path.join(hf_dir, item)
            if os.path.isdir(path):
                shutil.rmtree(path)
            else:
                os.remove(path)
                
    print("Copying backend files...")
    for item in os.listdir(backend_dir):
        src = os.path.join(backend_dir, item)
        dst = os.path.join(hf_dir, item)
        if os.path.isdir(src):
            shutil.copytree(src, dst)
        else:
            shutil.copy2(src, dst)
            
    print("Committing and pushing...")
    subprocess.run(["git", "add", "."], cwd=hf_dir, check=True)
    subprocess.run(["git", "commit", "-m", "chore: sync backend to HF space"], cwd=hf_dir, check=False)
    subprocess.run(["git", "push"], cwd=hf_dir, check=True)
    print("HF Space deployed successfully!")

if __name__ == "__main__":
    deploy_hf()
