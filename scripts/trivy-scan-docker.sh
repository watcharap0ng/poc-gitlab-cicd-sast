##scripts/trivy-scan-docker.sh
#!/bin/bash

#Download Trivy, please refer release version here https://github.com/aquasecurity/trivy/releases
curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/${TRIVY_VERSION}/contrib/install.sh | sh -s -- -b /usr/local/bin ${TRIVY_VERSION}

##Begin Scanning
echo "Check trivy version"
trivy --version

# cache cleanup is needed when scanning images with the same tags, it does not remove the database
trivy image --clear-cache

echo "Scanning Docker Image..."
trivy image \
  --cache-dir .trivycache/ \
  --severity HIGH,CRITICAL\
  -f json -o trivy_images_report.json \
  --scanners vuln \
   "$1"