#!/usr/bin/env python3

"""
DAST-Specific DefectDojo Integration
Enhanced DefectDojo uploader specifically for DAST (OWASP ZAP) findings

This script extends the existing upload-reports-enhanced.py with DAST-specific
features including enhanced finding processing, better OWASP categorization,
and dedicated DAST engagement management.

Usage: python3 dast-defectdojo-enhanced.py URL TOKEN PROJECT [REPORT_FILES...]

Example:
    python3 dast-defectdojo-enhanced.py https://defectdojo.example.com YOUR_TOKEN "Production App" dast-report.json
"""

import requests
import sys
import json
import os
from datetime import datetime, timezone
from urllib.parse import urlparse
import logging

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class DASTDefectDojoUploader:
    """Enhanced DefectDojo uploader for DAST findings"""

    def __init__(self, base_url, api_key, project_name, engagement_name=None):
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.project_name = project_name
        self.engagement_name = engagement_name or f"DAST Scan {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
        self.headers = {
            'Authorization': f'Token {api_key}',
            'Content-Type': 'application/json'
        }
        self.dast_scan_type_id = self._get_dast_scan_type_id()

    def _get_dast_scan_type_id(self):
        """Get or create DAST scan type"""
        try:
            # Try to find existing DAST scan type
            url = f"{self.base_url}/api/v2/test_types/"
            response = requests.get(url, headers=self.headers)

            if response.status_code == 200:
                test_types = response.json().get('results', [])
                for test_type in test_types:
                    if test_type.get('name', '').lower() == 'dast scan':
                        logger.info(f"Found DAST scan type: {test_type['name']} (ID: {test_type['id']})")
                        return test_type['id']

            # If not found, use default test type ID
            logger.warning("DAST scan type not found, using default test type (ID: 1)")
            return 1

        except Exception as e:
            logger.error(f"Error getting DAST scan type: {e}")
            return 1

    def create_product_if_not_exists(self):
        """Create product if it doesn't exist and return product ID"""
        try:
            # Check if product exists
            search_url = f"{self.base_url}/api/v2/products/?name={self.project_name}"
            response = requests.get(search_url, headers=self.headers)

            if response.status_code == 200:
                products = response.json().get('results', [])
                if products:
                    product_id = products[0]['id']
                    logger.info(f"✅ Found existing product: {self.project_name} (ID: {product_id})")
                    return product_id

            # Create new product with DAST-specific tags
            product_data = {
                "name": self.project_name,
                "description": f"DAST scanning target: {self.project_name}\nAuto-created by DAST Standalone Scanner",
                "prod_type": 1,  # Web Application
                "tags": ["dast", "automated", "owasp-zap", "security-testing"],
                "technical_contact": "security@example.com",
                "business_contact": "dev-team@example.com"
            }

            create_url = f"{self.base_url}/api/v2/products/"
            response = requests.post(create_url, headers=self.headers, json=product_data)

            if response.status_code == 201:
                product_id = response.json()['id']
                logger.info(f"✅ Created new product: {self.project_name} (ID: {product_id})")
                return product_id
            else:
                logger.error(f"❌ Failed to create product: {response.text}")
                return None

        except Exception as e:
            logger.error(f"Error creating product: {e}")
            return None

    def create_dast_engagement_if_not_exists(self, product_id):
        """Create DAST-specific engagement if it doesn't exist and return engagement ID"""
        try:
            # Check if DAST engagement exists for today
            engagement_date = datetime.now().strftime('%Y-%m-%d')
            search_url = f"{self.base_url}/api/v2/engagements/?name={self.engagement_name}&product={product_id}"
            response = requests.get(search_url, headers=self.headers)

            if response.status_code == 200:
                engagements = response.json().get('results', [])
                # Check for engagement with today's date
                for eng in engagements:
                    if eng['target_start'].startswith(engagement_date):
                        logger.info(f"✅ Found existing DAST engagement: {self.engagement_name} (ID: {eng['id']})")
                        return eng['id']

            # Create new DAST engagement
            engagement_data = {
                "name": self.engagement_name,
                "description": f"DAST security scan conducted on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\nScanner: DAST Standalone Scanner v1.0.0\nScan Type: OWASP ZAP Dynamic Analysis",
                "product": product_id,
                "target_start": datetime.now().isoformat(),
                "target_end": datetime.now().isoformat(),
                "status": "In Progress",
                "engagement_type": "CI/CD",
                "test_type": self.dast_scan_type_id,
                "tags": ["dast", "zap", "dynamic-analysis", "automated"],
                "lead": 1,  # Assuming user ID 1 exists
                "requester": 1,  # Assuming user ID 1 exists
            }

            create_url = f"{self.base_url}/api/v2/engagements/"
            response = requests.post(create_url, headers=self.headers, json=engagement_data)

            if response.status_code == 201:
                engagement_id = response.json()['id']
                logger.info(f"✅ Created new DAST engagement: {self.engagement_name} (ID: {engagement_id})")
                return engagement_id
            else:
                logger.error(f"❌ Failed to create engagement: {response.text}")
                return None

        except Exception as e:
            logger.error(f"Error creating engagement: {e}")
            return None

    def map_zap_risk_to_severity(self, zap_risk):
        """Map ZAP risk levels to DefectDojo severity"""
        risk_mapping = {
            'High': 'Critical',
            'Medium': 'High',
            'Low': 'Medium',
            'Informational': 'Low'
        }
        return risk_mapping.get(zap_risk, 'Info')

    def extract_owasp_category(self, reference):
        """Extract OWASP category from ZAP reference"""
        if not reference:
            return "Unknown"

        # Map common ZAP references to OWASP categories
        owasp_mapping = {
            "WASC-1": "Path Traversal",
            "WASC-2": "SQL Injection",
            "WASC-3": "XSS",
            "WASC-4": "Cross-Site Request Forgery",
            "WASC-5": "Server-Side Include",
            "WASC-6": "Session Hijacking",
            "WASC-7": "Buffer Overflow",
            "WASC-8": "Weak Authentication",
            "WASC-9": "Transport Layer Security",
            "WASC-10": "Insecure Cryptographic Storage",
            "WASC-11": "Insufficient Authorization",
            "WASC-12": "Denial of Service",
            "WASC-13": "Improper Input Validation",
            "WASC-14": "Information Leakage",
            "WASC-15": "Broken Authentication",
            "WASC-16": "Broken Access Control",
            "WASC-17": "Server-Side Request Forgery",
            "WASC-18": "XML External Entity",
            "WASC-19": "Insecure Deserialization",
            "WASC-20": "Security Misconfiguration"
        }

        return owasp_mapping.get(reference, reference or "Other")

    def process_zap_dast_report(self, file_path, engagement_id, target_url):
        """Process ZAP DAST report and convert to enhanced DefectDojo format"""
        try:
            with open(file_path, 'r') as f:
                zap_data = json.load(f)

            logger.info(f"🕷️ Processing ZAP DAST report: {os.path.basename(file_path)}")

            # Extract scan metadata
            scan_metadata = self._extract_scan_metadata(zap_data, target_url)

            # Transform ZAP format to DefectDojo findings format
            findings = []
            sites = zap_data.get('site', [])

            if isinstance(sites, list) and len(sites) > 0:
                site = sites[0]
                alerts = site.get('alerts', [])

                for alert in alerts:
                    finding = self._create_finding_from_alert(alert, scan_metadata)
                    if finding:
                        findings.append(finding)

            logger.info(f"📊 Processed {len(findings)} findings from ZAP report")

            # Create upload data with enhanced metadata
            upload_data = {
                "scan_type": "OWASP ZAP DAST Scan",
                "scan_date": scan_metadata.get('scan_timestamp', datetime.now().strftime('%Y-%m-%d')),
                "minimum_severity": "Info",
                "active": True,
                "verified": False,
                "auto_create_context": True,
                "skip_duplicates": True,
                "close_old_findings": True,
                "engagement": engagement_id,
                "findings": findings,
                "scan_metadata": scan_metadata
            }

            return upload_data

        except Exception as e:
            logger.error(f"Error processing ZAP DAST report: {e}")
            return None

    def _extract_scan_metadata(self, zap_data, target_url):
        """Extract comprehensive scan metadata from ZAP report"""
        return {
            "scanner": {
                "name": "OWASP ZAP",
                "version": "2.12.0",
                "type": "DAST Standalone Scanner v1.0.0"
            },
            "target": {
                "url": target_url,
                "host": urlparse(target_url).netloc,
                "scan_timestamp": datetime.now().isoformat()
            },
            "scan_configuration": {
                "scan_depth": os.getenv("SCAN_DEPTH", "5"),
                "threads": os.getenv("THREADS", "5"),
                "max_duration": os.getenv("MAX_DURATION", "1800"),
                "delay_ms": os.getenv("DELAY_MS", "0"),
                "ajax_spider_enabled": os.getenv("AJAX_SPIDER", "true"),
                "browser_id": os.getenv("BROWSER_ID", "chrome-headless")
            },
            "execution": {
                "environment": os.getenv("ENVIRONMENT", "CI/CD"),
                "pipeline_id": os.getenv("CI_PIPELINE_ID", "standalone"),
                "executor": os.getenv("EXECUTOR", "security-team"),
                "branch": os.getenv("CI_COMMIT_REF_NAME", "unknown")
            }
        }

    def _create_finding_from_alert(self, alert, scan_metadata):
        """Create a comprehensive DefectDojo finding from ZAP alert"""
        try:
            # Get instances of this finding
            instances = alert.get('instances', [])
            if not instances:
                return None

            # Use first instance as primary
            primary_instance = instances[0]

            # Extract OWASP category and CWE
            owasp_category = self.extract_owasp_category(alert.get('reference', ''))
            cwe_id = int(alert.get('cweid', 0)) if alert.get('cweid') else 0

            # Build enhanced description
            description = self._build_enhanced_description(alert, primary_instance)

            # Get URLs with detailed evidence
            urls_detailed = self._extract_url_details(instances)

            # Determine scanner confidence
            confidence = self._determine_confidence(alert)

            # Create finding
            finding = {
                'title': alert.get('name', 'Unknown ZAP Finding'),
                'description': description,
                'severity': self.map_zap_risk_to_severity(alert.get('risk', 'Low')),
                'cwe': cwe_id,
                'owasp': owasp_category,
                'references': alert.get('reference', ''),
                'solution': alert.get('solution', ''),
                'impact': self._build_impact_statement(alert),
                'false_positive': False,
                'duplicate': False,
                'out_of_scope': False,
                'mitigated': False,
                'mitigation_steps': alert.get('solution', ''),
                'impact_details': alert.get('riskdesc', ''),
                'test_type': 'DAST',
                'confidence': confidence,
                'finding_type': 'Vulnerability',
                'static_finding': False,
                'dynamic_finding': True,
                'active': True,
                'verified': False,
                'risk_accepted': False,
                'mitigated': None,
                'urls_detailed': urls_detailed,
                'tags': self._generate_finding_tags(alert, owasp_category),
                'date': datetime.now().strftime('%Y-%m-%d'),
                'found_by': [
                    {
                        "name": "DAST Standalone Scanner",
                        "email": "security@example.com"
                    }
                ],
                'scan_metadata': scan_metadata
            }

            return finding

        except Exception as e:
            logger.warning(f"Error creating finding from alert: {e}")
            return None

    def _build_enhanced_description(self, alert, instance):
        """Build enhanced description with technical details"""
        base_description = alert.get('desc', '')

        # Add technical details
        tech_details = []

        if instance.get('method'):
            tech_details.append(f"HTTP Method: {instance['method']}")

        if instance.get('param'):
            tech_details.append(f"Parameter: {instance['param']}")

        if instance.get('attack'):
            tech_details.append(f"Attack Pattern: {instance['attack']}")

        if instance.get('evidence'):
            tech_details.append(f"Evidence: {instance['evidence']}")

        # Combine descriptions
        description = base_description

        if tech_details:
            description += "\n\n**Technical Details:**\n"
            for detail in tech_details:
                description += f"- {detail}\n"

        # Add reference if available
        if alert.get('reference'):
            description += f"\n\n**Reference:** {alert['reference']}"

        return description

    def _build_impact_statement(self, alert):
        """Build comprehensive impact statement"""
        risk = alert.get('risk', 'Low')
        base_impact = alert.get('riskdesc', '')

        # Add specific impact based on risk level
        impact_mapping = {
            'High': "This vulnerability poses a significant security risk and could lead to complete system compromise, data breach, or unauthorized access to sensitive information.",
            'Medium': "This vulnerability could lead to unauthorized access to data or functionality, potentially compromising user privacy or system integrity.",
            'Low': "This vulnerability represents a minor security issue that may provide limited information or access but poses minimal risk.",
            'Informational': "This finding provides information about the application but does not represent an immediate security risk."
        }

        specific_impact = impact_mapping.get(risk, '')

        if specific_impact:
            return f"{base_impact}\n\n{specific_impact}"
        else:
            return base_impact

    def _extract_url_details(self, instances):
        """Extract detailed URL information from instances"""
        urls_detailed = []

        for instance in instances:
            url_detail = {
                'url': instance.get('uri', ''),
                'method': instance.get('method', ''),
                'parameter': instance.get('param', ''),
                'attack': instance.get('attack', ''),
                'evidence': instance.get('evidence', '')
            }
            urls_detailed.append(url_detail)

        return urls_detailed

    def _determine_confidence(self, alert):
        """Determine confidence level based on ZAP alert properties"""
        # ZAP doesn't always provide confidence, so infer from risk and plugin
        risk = alert.get('risk', 'Low')
        plugin_id = alert.get('pluginid', '')

        if risk == 'High':
            return 'High'
        elif risk == 'Medium':
            return 'Medium'
        elif plugin_id:  # Has specific plugin ID = higher confidence
            return 'Medium'
        else:
            return 'Low'

    def _generate_finding_tags(self, alert, owasp_category):
        """Generate relevant tags for the finding"""
        tags = ['dast', 'zap', 'automated', 'dynamic-analysis']

        # Add OWASP category tag
        if owasp_category and owasp_category != 'Unknown':
            tags.append(f"owasp-{owasp_category.lower().replace(' ', '-')}")

        # Add risk-based tags
        risk = alert.get('risk', '').lower()
        if risk:
            tags.append(f"risk-{risk}")

        # Add plugin-specific tags
        plugin_id = alert.get('pluginid', '')
        if plugin_id:
            tags.append(f"plugin-{plugin_id}")

        return tags

    def upload_findings(self, upload_data, engagement_id):
        """Upload findings to DefectDojo"""
        try:
            logger.info(f"📤 Uploading {len(upload_data.get('findings', []))} findings to DefectDojo...")

            # Prepare upload URL and headers for multipart form data
            upload_url = f"{self.base_url}/api/v2/import-scan/"
            headers = {
                'Authorization': f'Token {self.api_key}',
            }

            # Convert findings to JSON string
            findings_json = json.dumps(upload_data)

            # Prepare multipart form data
            files = {
                'file': ('findings.json', findings_json, 'application/json'),
            }

            data = {
                'engagement': engagement_id,
                'scan_type': 'OWASP ZAP DAST Scan',
                'minimum_severity': 'Info',
                'active': 'true',
                'verified': 'false',
                'auto_create_context': 'true',
                'skip_duplicates': 'true',
                'close_old_findings': 'true',
            }

            response = requests.post(upload_url, headers=headers, files=files, data=data)

            if response.status_code == 201:
                result = response.json()
                findings_count = result.get('findings_count', 0)
                logger.info(f"✅ Successfully uploaded {findings_count} findings to DefectDojo")

                # Display summary of uploaded findings
                if findings_count > 0:
                    self._display_upload_summary(upload_data.get('findings', []))

                return result
            else:
                logger.error(f"❌ Failed to upload findings: {response.status_code} - {response.text}")
                return None

        except Exception as e:
            logger.error(f"Error uploading findings: {e}")
            return None

    def _display_upload_summary(self, findings):
        """Display a summary of uploaded findings"""
        severity_count = {
            'Critical': 0,
            'High': 0,
            'Medium': 0,
            'Low': 0,
            'Info': 0
        }

        owasp_count = {}

        for finding in findings:
            severity = finding.get('severity', 'Info')
            severity_count[severity] = severity_count.get(severity, 0) + 1

            owasp = finding.get('owasp', 'Unknown')
            owasp_count[owasp] = owasp_count.get(owasp, 0) + 1

        logger.info("📊 Upload Summary:")
        logger.info("  Severity Distribution:")
        for severity, count in severity_count.items():
            if count > 0:
                logger.info(f"    {severity}: {count}")

        logger.info("  OWASP Categories:")
        for owasp, count in sorted(owasp_count.items(), key=lambda x: x[1], reverse=True)[:5]:
            logger.info(f"    {owasp}: {count}")

def main():
    """Main function"""
    if len(sys.argv) < 4:
        print("Usage: python3 dast-defectdojo-enhanced.py URL TOKEN PROJECT [REPORT_FILES...]")
        print("\nExample:")
        print("  python3 dast-defectdojo-enhanced.py https://defectdojo.example.com YOUR_TOKEN 'Production App' dast-report.json")
        print("\nEnvironment Variables (Optional):")
        print("  TARGET_URL - Target URL for scan metadata")
        print("  SCAN_DEPTH - Scan depth configuration")
        print("  THREADS - Number of threads used")
        print("  MAX_DURATION - Maximum scan duration")
        print("  AJAX_SPIDER - Whether AJAX spider was enabled")
        print("  BROWSER_ID - Browser ID for AJAX spider")
        print("  ENVIRONMENT - Environment name (CI/CD, staging, production)")
        print("  CI_PIPELINE_ID - Pipeline ID for tracking")
        print("  CI_COMMIT_REF_NAME - Branch/commit reference")
        print("  EXECUTOR - Who/what executed the scan")
        sys.exit(1)

    # Parse arguments
    base_url = sys.argv[1]
    api_key = sys.argv[2]
    project_name = sys.argv[3]
    report_files = sys.argv[4:]

    # Get target URL from environment or use default
    target_url = os.getenv('TARGET_URL', 'Unknown Target')

    logger.info("🚀 DAST DefectDojo Enhanced Uploader v1.0.0")
    logger.info(f"📊 DefectDojo URL: {base_url}")
    logger.info(f"🎯 Project: {project_name}")
    logger.info(f"🌐 Target: {target_url}")
    logger.info(f"📁 Report Files: {report_files}")

    # Initialize uploader
    uploader = DASTDefectDojoUploader(base_url, api_key, project_name)

    # Create product if it doesn't exist
    product_id = uploader.create_product_if_not_exists()
    if not product_id:
        logger.error("❌ Failed to create or find product")
        sys.exit(1)

    # Create DAST engagement
    engagement_id = uploader.create_dast_engagement_if_not_exists(product_id)
    if not engagement_id:
        logger.error("❌ Failed to create or find engagement")
        sys.exit(1)

    # Process each report file
    total_findings_uploaded = 0

    for report_file in report_files:
        if not os.path.exists(report_file):
            logger.warning(f"⚠️ Report file not found: {report_file}")
            continue

        # Check if it's a ZAP DAST report
        if 'dast' in report_file.lower() or 'zap' in report_file.lower():
            upload_data = uploader.process_zap_dast_report(report_file, engagement_id, target_url)

            if upload_data:
                result = uploader.upload_findings(upload_data, engagement_id)
                if result:
                    findings_count = result.get('findings_count', 0)
                    total_findings_uploaded += findings_count
                    logger.info(f"✅ Uploaded {findings_count} findings from {report_file}")
                else:
                    logger.error(f"❌ Failed to upload findings from {report_file}")
            else:
                logger.error(f"❌ Failed to process report file: {report_file}")
        else:
            logger.info(f"ℹ️ Skipping non-DAST report: {report_file}")

    logger.info(f"🎉 Total findings uploaded: {total_findings_uploaded}")

    if total_findings_uploaded > 0:
        logger.info(f"📋 View findings in DefectDojo: {base_url}/engagement/{engagement_id}")
        sys.exit(0)
    else:
        logger.info("ℹ️ No findings to upload")
        sys.exit(0)

if __name__ == "__main__":
    main()