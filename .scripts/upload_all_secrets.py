import os
from huggingface_hub import HfApi
from dotenv import dotenv_values

print('Loading local .env...')
env_vars = dotenv_values('backend/.env')

api = HfApi()
repo_id = 'imDrizzle/lurien-matrix-firewall'

for key, value in env_vars.items():
    if key in ['HOST', 'PORT', 'MODEL_PATH']:
        continue
    if value:
        print(f'Adding {key} to Space Secrets...')
        try:
            api.add_space_secret(repo_id=repo_id, key=key, value=value)
        except Exception as e:
            print(f'Failed to add {key}: {e}')

print('Done uploading all secrets! Space should restart automatically.')
