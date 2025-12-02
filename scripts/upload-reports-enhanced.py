#!/usr/bin/env python3

import requests
import sys
import json
import os
from datetime import datetime

class DefectDojoUploader:
    def __init__(self, base_url, api_key, product_name, engagement_name=None):
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.product_name = product_name
        self.engagement_name = engagement_name or f"CI/CD Pipeline - {os.getenv('CI_COMMIT_REF_NAME', 'main')}"
        self.headers = {
            'Authorization': f'Token {api_key}',
            'Content-Type': 'application/json'
        }

    def create_product_if_not_exists(self):
        """Create product if it doesn't exist and return product ID"""
        # Check if product exists
        search_url = f"{self.base_url}/api/v2/products/?name={self.product_name}"
        response = requests.get(search_url, headers=self.headers)

        if response.status_code == 200:
            products = response.json().get('results', [])
            if products:
                product_id = products[0]['id']
                print(f"✅ Found existing product: {self.product_name} (ID: {product_id})")
                return product_id

        # Create new product
        product_data = {
            "name": self.product_name,
            "description": f"Auto-created product for {self.product_name}",
            "prod_type": 1,  # Web Application
            "tags": ["ci-cd", "automated", os.getenv('CI_PROJECT_NAME', 'unknown')]
        }

        create_url = f"{self.base_url}/api/v2/products/"
        response = requests.post(create_url, headers=self.headers, json=product_data)

        if response.status_code == 201:
            product_id = response.json()['id']
            print(f"✅ Created new product: {self.product_name} (ID: {product_id})")
            return product_id
        else:
            print(f"❌ Failed to create product: {response.text}")
            return None

    def create_engagement_if_not_exists(self, product_id):
        """Create engagement if it doesn't exist and return engagement ID"""
        # Check if engagement exists for this pipeline run
        engagement_date = datetime.now().strftime('%Y-%m-%d')
        search_url = f"{self.base_url}/api/v2/engagements/?name={self.engagement_name}&product={product_id}"
        response = requests.get(search_url, headers=self.headers)

        if response.status_code == 200:
            engagements = response.json().get('results', [])
            # Check for engagement with today's date
            for eng in engagements:
                if eng['target_start'].startswith(engagement_date):
                    print(f"✅ Found existing engagement: {self.engagement_name} (ID: {eng['id']})")
                    return eng['id']

        # Create new engagement
        engagement_data = {
            "name": self.engagement_name,
            "description": f"Auto-created engagement for CI/CD pipeline run",
            "product": product_id,
            "target_start": datetime.now().isoformat(),
            "target_end": datetime.now().isoformat(),
            "status": "In Progress",
            "engagement_type": "CI/CD",
            "tags": ["automated", "ci-cd", os.getenv('CI_PIPELINE_ID', 'unknown')]
        }

        create_url = f"{self.base_url}/api/v2/engagements/"
        response = requests.post(create_url, headers=self.headers, json=engagement_data)

        if response.status_code == 201:
            engagement_id = response.json()['id']
            print(f"✅ Created new engagement: {self.engagement_name} (ID: {engagement_id})")
            return engagement_id
        else:
            print(f"❌ Failed to create engagement: {response.text}")
            return None

    def get_scan_type(self, file_name):
        """Determine scan type based on filename"""
        scan_types = {
            'gitleaks.json': 'Gitleaks Scan',
            'gitleaks-report.json': 'Gitleaks Scan',
            'semgrep.json': 'Semgrep JSON Report',
            'semgrep_nodejs.json': 'Semgrep JSON Report',
            'trivy_fs_report.json': 'Trivy Scan',
            'trivy_images_report.json': 'Trivy Scan',
            'gl-dast-report.json': 'OWASP ZAP DAST Scan',
            'gl-dast-report.xml': 'OWASP ZAP DAST Scan (XML)',
            'dependency_track_findings.json': 'Dependency-Track Scan',
            'syft.cdx.json': 'Software Bill of Materials (SBOM)',
            'njsscan.sarif': 'SARIF',
            'security_summary.json': 'Security Summary Report'
        }
        return scan_types.get(file_name, 'Generic Findings Import')

    def process_zap_dast_report(self, file_path, engagement_id):
        """Process ZAP DAST report and convert to DefectDojo format"""
        try:
            with open(file_path, 'r') as f:
                zap_data = json.load(f)

            print(f"🕷️ Processing ZAP DAST report: {os.path.basename(file_path)}")

            # Transform ZAP format to DefectDojo findings format
            findings = []
            sites = zap_data.get('site', [])

            if isinstance(sites, list) and len(sites) > 0:
                site = sites[0]
                alerts = site.get('alerts', [])

                for alert in alerts:
                    # Get instances of this finding
                    instances = alert.get('instances', [])
                    if instances:
                        instance = instances[0]  # Use first instance

                        finding = {
                            'title': alert.get('name', 'Unknown ZAP Finding'),
                            'description': alert.get('desc', ''),
                            'severity': self.map_zap_risk_to_severity(alert.get('risk', 'Low')),
                            'cwe': int(alert.get('cweid', 0)) if alert.get('cweid') else None,
                            'references': alert.get('reference', ''),
                            'solution': alert.get('solution', ''),
                            'false_positive': False,
                            'duplicate': False,
                            'out_of_scope': False,
                            'mitigated': None,
                            'impact': alert.get('risk', 'Low'),
                            'confidence': 'High',  # ZAP baseline scans are generally high confidence
                            'finding_type': 'Vulnerability',
                            'test_type': 'DAST',
                            'static_finding': False,
                            'dynamic_finding': True,
                            'active': True,
                            'verified': False,  # Let DefectDojo verify
                            'mitigated': False,

                            # URL and instance information
                            'url': site.get('@name', ''),
                            'param': instance.get('param', ''),
                            'attack': instance.get('attack', ''),
                            'evidence': instance.get('evidence', ''),
                            'request': instance.get('request', ''),
                            'response': instance.get('response', ''),

                            # OWASP ZAP specific metadata
                            'scanner_confidence': 'High',
                            'owasp_top_10': self.get_owasp_mapping(alert.get('name', '')),
                            'tags': ['DAST', 'OWASP ZAP', 'Web Application']
                        }

                        findings.append(finding)

            print(f"📊 Extracted {len(findings)} findings from ZAP DAST report")

            # Upload transformed findings as DefectDojo import scan
            if findings:
                return self.upload_zap_findings(findings, engagement_id, file_path)
            else:
                print("⚠️  No findings found in ZAP DAST report")
                return True

        except Exception as e:
            print(f"❌ Error processing ZAP DAST report {file_path}: {str(e)}")
            return False

    def map_zap_risk_to_severity(self, zap_risk):
        """Map ZAP risk levels to DefectDojo severity levels"""
        risk_mapping = {
            'High': 'High',
            'Critical': 'Critical',
            'Medium': 'Medium',
            'Low': 'Low',
            'Informational': 'Info'
        }
        return risk_mapping.get(zap_risk, 'Low')

    def get_owasp_mapping(self, alert_name):
        """Map ZAP alert names to OWASP Top 10 categories"""
        owasp_mapping = {
            'Cross Site Scripting': 'A03:2021-Injection',
            'SQL Injection': 'A03:2021-Injection',
            'X-Content-Type-Options header missing': 'A05:2021-Security Misconfiguration',
            'Cookie without SameSite Attribute': 'A05:2021-Security Misconfiguration',
            'CSP Scanner: Content Security Policy Not Implemented': 'A05:2021-Security Misconfiguration',
            'X-Frame-Options header not set': 'A05:2021-Security Misconfiguration',
            'Absence of Anti-CSRF Tokens': 'A01:2021-Broken Access Control',
            'Cross Domain Script Inclusion': 'A05:2021-Security Misconfiguration',
            'Content Type Missing': 'A05:2021-Security Misconfiguration',
            'Cookie without Secure Flag': 'A05:2021-Security Misconfiguration'
        }
        return owasp_mapping.get(alert_name, None)

    def upload_zap_findings(self, findings, engagement_id, original_file_path):
        """Upload ZAP findings as DefectDojo import scan"""
        try:
            # Prepare DefectDojo import data
            import_data = {
                'active': True,
                'verified': False,
                'scan_type': 'OWASP ZAP DAST Scan',
                'minimum_severity': 'Low',
                'engagement': engagement_id,
                'lead': 1,
                'environment': os.getenv('CI_ENVIRONMENT_NAME', 'Development'),
                'version': os.getenv('CI_COMMIT_SHORT_SHA', 'unknown'),
                'build_id': os.getenv('CI_PIPELINE_ID', 'unknown'),
                'commit_hash': os.getenv('CI_COMMIT_SHA', 'unknown'),
                'branch_tag': os.getenv('CI_COMMIT_REF_NAME', 'main'),
                'source_code_management_uri': os.getenv('CI_PROJECT_URL', ''),
                'deduplication_on_engagement': True,

                # Import findings as JSON
                'import_findings': findings
            }

            upload_url = f"{self.base_url}/api/v2/import-scan/"
            headers_upload = {'Authorization': f'Token {self.api_key}'}

            response = requests.post(upload_url, headers=headers_upload, json=import_data)

            if response.status_code == 201:
                result = response.json()
                print(f"✅ Successfully uploaded ZAP DAST findings (Test ID: {result.get('test', 'N/A')})")
                return True
            else:
                print(f"❌ Failed to upload ZAP DAST findings: {response.status_code} - {response.text}")
                return False

        except Exception as e:
            print(f"❌ Exception uploading ZAP DAST findings: {str(e)}")
            return False

    def upload_report(self, file_path, engagement_id):
        """Upload a single report to DefectDojo"""
        if not os.path.exists(file_path) or os.path.getsize(file_path) == 0:
            print(f"⚠️  File not found or empty: {file_path}")
            return False

        scan_type = self.get_scan_type(os.path.basename(file_path))
        print(f"📤 Uploading {os.path.basename(file_path)} as {scan_type}")

        # Prepare upload data
        data = {
            'active': True,
            'verified': False,  # Let DefectDojo auto-verify
            'scan_type': scan_type,
            'minimum_severity': 'Low',
            'engagement': engagement_id,
            'lead': 1,  # Default lead
            'environment': os.getenv('CI_ENVIRONMENT_NAME', 'Development'),
            'version': os.getenv('CI_COMMIT_SHORT_SHA', 'unknown'),
            'build_id': os.getenv('CI_PIPELINE_ID', 'unknown'),
            'commit_hash': os.getenv('CI_COMMIT_SHA', 'unknown'),
            'branch_tag': os.getenv('CI_COMMIT_REF_NAME', 'main'),
            'source_code_management_uri': os.getenv('CI_PROJECT_URL', ''),
            'deduplication_on_engagement': True
        }

        # Upload file
        upload_url = f"{self.base_url}/api/v2/import-scan/"

        try:
            with open(file_path, 'rb') as f:
                files = {'file': (os.path.basename(file_path), f, 'application/json')}
                headers_upload = {'Authorization': f'Token {self.api_key}'}

                response = requests.post(upload_url, headers=headers_upload, data=data, files=files)

            if response.status_code == 201:
                result = response.json()
                print(f"✅ Successfully uploaded {os.path.basename(file_path)} (Test ID: {result.get('test', 'N/A')})")
                return True
            else:
                print(f"❌ Failed to upload {os.path.basename(file_path)}: {response.status_code} - {response.text}")
                return False

        except Exception as e:
            print(f"❌ Exception uploading {os.path.basename(file_path)}: {str(e)}")
            return False

    def upload_all_reports(self, report_files):
        """Upload multiple reports to DefectDojo with auto-created product/engagement"""
        print(f"🚀 Starting DefectDojo upload for {len(report_files)} reports")

        # Create or get product
        product_id = self.create_product_if_not_exists()
        if not product_id:
            print("❌ Failed to create/get product. Aborting uploads.")
            return False

        # Create or get engagement
        engagement_id = self.create_engagement_if_not_exists(product_id)
        if not engagement_id:
            print("❌ Failed to create/get engagement. Aborting uploads.")
            return False

        print(f"📋 Using Product ID: {product_id}, Engagement ID: {engagement_id}")

        # Upload all reports
        successful_uploads = 0
        failed_uploads = 0

        for report_file in report_files:
            # Handle ZAP DAST report specially
            if os.path.basename(report_file) == 'gl-dast-report.json':
                print("🕷️ Detected ZAP DAST report - processing with special handler")
                if self.process_zap_dast_report(report_file, engagement_id):
                    successful_uploads += 1
                else:
                    failed_uploads += 1
            else:
                # Handle other report types normally
                if self.upload_report(report_file, engagement_id):
                    successful_uploads += 1
                else:
                    failed_uploads += 1

        print(f"\n📊 Upload Summary:")
        print(f"   ✅ Successful uploads: {successful_uploads}")
        print(f"   ❌ Failed uploads: {failed_uploads}")
        print(f"   📈 Total files processed: {len(report_files)}")

        return successful_uploads > 0

def main():
    if len(sys.argv) < 4:
        print("Usage: python3 upload-reports-enhanced.py <base_url> <api_key> <product_name> [report_files...]")
        print("\nEnvironment variables available:")
        print("   CI_PROJECT_NAME, CI_COMMIT_REF_NAME, CI_PIPELINE_ID")
        print("   CI_COMMIT_SHA, CI_COMMIT_SHORT_SHA, CI_PROJECT_URL")
        print("   CI_ENVIRONMENT_NAME")
        sys.exit(1)

    base_url = sys.argv[1]
    api_key = sys.argv[2]
    product_name = sys.argv[3]

    # Default report files if none provided
    default_reports = [
        'gitleaks.json',
        'semgrep.json',
        'semgrep_nodejs.json',
        'trivy_fs_report.json',
        'trivy_images_report.json',
        'dependency_track_findings.json',
        'security_summary.json'
    ]

    report_files = sys.argv[4:] if len(sys.argv) > 4 else default_reports

    # Initialize uploader
    uploader = DefectDojoUploader(
        base_url=base_url,
        api_key=api_key,
        product_name=product_name
    )

    # Upload reports
    success = uploader.upload_all_reports(report_files)

    if success:
        print("🎉 DefectDojo upload completed successfully!")
        sys.exit(0)
    else:
        print("💥 DefectDojo upload failed!")
        sys.exit(1)

if __name__ == "__main__":
    main()