import os
from huggingface_hub import HfApi
from dotenv import dotenv_values

print('Loading local .env...')
env_vars = dotenv_values('backend/.env')
mongo_uri = env_vars.get('MONGODB_URI')

if not mongo_uri:
    print('Failed to find MONGODB_URI in backend/.env')
    exit(1)

api = HfApi()
repo_id = 'imDrizzle/lurien-matrix-firewall'

print('Adding MONGODB_URI to Space Secrets...')
api.add_space_secret(repo_id=repo_id, key='MONGODB_URI', value=mongo_uri)

print('Deleting .env file from the Space repository for security...')
try:
    api.delete_file(path_in_repo='.env', repo_id=repo_id, repo_type='space', commit_message='Remove .env file and migrate to Space Secrets')
    print('Successfully deleted .env file')
except Exception as e:
    print(f'Note on deleting .env (might already be gone): {e}')

print('Done! Space should restart automatically.')
