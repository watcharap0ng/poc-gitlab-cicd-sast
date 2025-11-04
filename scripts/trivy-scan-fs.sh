##scripts/trivy-scan-fs.sh
#!/bin/bash
# Download Trivy
# please refer release version here https://github.com/aquasecurity/trivy/releases

curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/${TRIVY_VERSION}/contrib/install.sh | sh -s -- -b /usr/local/bin ${TRIVY_VERSION}

##Begin Scanning
echo "Check trivy version"
trivy --version 

echo "Scanning Current Repository"
trivy fs \
  --cache-dir .trivycache/ \
  --severity HIGH,CRITICAL \
  -f json -o trivy_fs_report.json \
  $CI_PROJECT_DIR