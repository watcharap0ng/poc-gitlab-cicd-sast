import requests
import sys

file_name = sys.argv[1]
domain_name = sys.argv[2]
token_defectdojo = sys.argv[3]
id_engagement = sys.argv[4]

scan_type = ''

if file_name == 'gitleaks.json':
    scan_type = 'Gitleaks Scan'
elif file_name == 'trivy_fs_report.json':
    scan_type = 'Trivy Scan'
elif file_name == 'trivy_images_report.json':
    scan_type = 'Trivy Scan'
# elif file_name == 'njsscan.sarif':
#     scan_type = 'SARIF'
elif file_name == 'semgrep.json':
    scan_type = 'Semgrep JSON Report'


headers = {
    'Authorization': 'Token '+token_defectdojo +''
}

url = 'http://'+domain_name+'/api/v2/import-scan/'

data = {
    'active': True,
    'verified': True,
    'scan_type': scan_type,
    'minimum_severity': 'Low',
    'engagement': id_engagement
}

files = {
    'file': open(file_name, 'rb')
}

response = requests.post(url, headers=headers, data=data, files=files)

if response.status_code == 201:
    print('Scan results imported successfully')
else:
    print(f'Failed to import scan results: {response.content}')
