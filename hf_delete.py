from huggingface_hub import HfApi

api = HfApi()

print("Deleting imDrizzle/lurien-matrix...")
try:
    api.delete_repo(repo_id="imDrizzle/lurien-matrix", repo_type="space")
    print("Deleted successfully!")
except Exception as e:
    print(f"Error: {e}")
