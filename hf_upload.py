from huggingface_hub import HfApi
import os

def upload_backend():
    print("Initializing HfApi...")
    api = HfApi()
    
    print("Uploading backend/ folder to imDrizzle/lurien-matrix-firewall...")
    try:
        api.upload_large_folder(
            folder_path="backend",
            repo_id="imDrizzle/lurien-matrix-firewall",
            repo_type="space"
        )
        print("Upload completed successfully!")
    except Exception as e:
        print(f"Error during upload: {e}")

if __name__ == "__main__":
    upload_backend()
