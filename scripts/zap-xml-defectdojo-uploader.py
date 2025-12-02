#!/usr/bin/env python3

"""
🕷️ ZAP XML TO DEFECTDOJO UPLOADER
========================================
Description: Specialized script to parse OWASP ZAP XML reports and upload to DefectDojo
Author: Security Team
Version: 1.0.0
Last Updated: 2025-01-01

Usage: python3 zap-xml-defectdojo-uploader.py <base_url> <api_key> <product_name> <xml_report_file>
Integration: Designed for GitLab CI/CD and standalone execution

This script specifically handles OWASP ZAP XML format with proper namespace handling,
rich metadata extraction, and OWASP Top 10 2021 mapping.
"""

import sys
import json
import xml.etree.ElementTree as ET
import requests
import os
import re
from datetime import datetime

class ZAPXMLDefectDojoUploader:
    def __init__(self, base_url, api_key, product_name, engagement_name=None):
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.product_name = product_name
        self.engagement_name = engagement_name or f"CI/CD Pipeline - {os.getenv('CI_COMMIT_REF_NAME', 'main')}"
        self.headers = {
            'Authorization': f'Token {api_key}',
            'Content-Type': 'application/json'
        }

        # OWASP Top 10 2021 Mapping
        self.owasp_mapping = {
            # A01: Broken Access Control
            'Cross Site Scripting': 'A01:2021-Broken Access Control',
            'Cross Domain Script Inclusion': 'A01:2021-Broken Access Control',
            'Absence of Anti-CSRF Tokens': 'A01:2021-Broken Access Control',
            'CSP Scanner: Content Security Policy Not Implemented': 'A01:2021-Broken Access Control',
            'Cookie without SameSite Attribute': 'A01:2021-Broken Access Control',

            # A03: Injection
            'SQL Injection': 'A03:2021-Injection',
            'Command Injection': 'A03:2021-Injection',
            'LDAP Injection': 'A03:2021-Injection',
            'XPath Injection': 'A03:2021-Injection',
            'Server Side Include': 'A03:2021-Injection',

            # A04: Insecure Design
            'Insecure Design': 'A04:2021-Insecure Design',

            # A05: Security Misconfiguration
            'X-Content-Type-Options header missing': 'A05:2021-Security Misconfiguration',
            'X-Frame-Options header not set': 'A05:2021-Security Misconfiguration',
            'Content Type Missing': 'A05:2021-Security Misconfiguration',
            'Cookie without Secure Flag': 'A05:2021-Security Misconfiguration',
            'Reverse Tabnabbing': 'A05:2021-Security Misconfiguration',
            'Cookie without HttpOnly Flag': 'A05:2021-Security Misconfiguration',

            # A06: Vulnerable and Outdated Components
            'Outdated Component': 'A06:2021-Vulnerable and Outdated Components',
            'Vulnerable Component': 'A06:2021-Vulnerable and Outdated Components',

            # A07: Identification and Authentication Failures
            'Authentication Bypass': 'A07:2021-Identification and Authentication Failures',
            'Weak Authentication': 'A07:2021-Identification and Authentication Failures',
            'Session Fixation': 'A07:2021-Identification and Authentication Failures',

            # A08: Software and Data Integrity Failures
            'Software and Data Integrity Failures': 'A08:2021-Software and Data Integrity Failures',
            'Insecure Deserialization': 'A08:2021-Software and Data Integrity Failures',

            # A09: Security Logging and Monitoring Failures
            'Security Logging and Monitoring Failures': 'A09:2021-Security Logging and Monitoring Failures',

            # A10: Server-Side Request Forgery (SSRF)
            'Server Side Request Forgery': 'A10:2021-Server-Side Request Forgery'
        }

        # Severity mapping from ZAP risk levels to DefectDojo
        self.severity_mapping = {
            'High': 'High',
            'Critical': 'Critical',
            'Medium': 'Medium',
            'Low': 'Low',
            'Informational': 'Info'
        }

        print(f"🔗 ZAP XML to DefectDojo Uploader Initialized")
        print(f"   URL: {self.base_url}")
        print(f"   Project: {self.product_name}")
        print(f"   Engagement: {self.engagement_name}")

    def parse_zap_xml_report(self, xml_file_path):
        """Parse OWASP ZAP XML report and extract findings"""
        try:
            print(f"📄 Parsing ZAP XML report: {os.path.basename(xml_file_path)}")

            # Parse XML with namespace handling
            tree = ET.parse(xml_file_path)
            root = tree.getroot()

            # Handle ZAP XML namespace
            namespace = {'zap': ''}
            if root.tag.startswith('{'):
                # Extract namespace from root tag
                namespace_match = re.match(r'\{(.*)\}', root.tag)
                if namespace_match:
                    namespace['zap'] = namespace_match.group(1)

            findings = []
            sites = root.findall('.//zap:site', namespace)

            print(f"🔍 Found {len(sites)} site(s) in XML report")

            for site in sites:
                site_name = site.get('name', '')
                print(f"🌐 Processing site: {site_name}")

                alerts = site.findall('.//zap:alertitem', namespace)
                print(f"⚠️  Found {len(alerts)} alerts for site {site_name}")

                for alert in alerts:
                    finding = self._extract_finding_from_alert(alert, site_name, namespace)
                    if finding:
                        findings.append(finding)

            print(f"✅ Successfully extracted {len(findings)} findings from XML report")
            return findings

        except ET.ParseError as e:
            print(f"❌ XML Parse Error: {str(e)}")
            return None
        except Exception as e:
            print(f"❌ Error parsing XML report: {str(e)}")
            return None

    def _extract_finding_from_alert(self, alert, site_name, namespace):
        """Extract individual finding from ZAP alert XML element"""
        try:
            # Basic alert information
            plugin_id = self._get_xml_text(alert, 'pluginid')
            alert_name = self._get_xml_text(alert, 'name')
            risk_code = self._get_xml_text(alert, 'riskcode')
            confidence = self._get_xml_text(alert, 'confidence')
            description = self._get_xml_text(alert, 'desc')
            solution = self._get_xml_text(alert, 'solution')
            reference = self._get_xml_text(alert, 'reference')
            cwe_id = self._get_xml_text(alert, 'cweid')
            wasc_id = self._get_xml_text(alert, 'wascid')

            if not alert_name or not plugin_id:
                return None

            # Map risk code to readable risk level
            risk_level = self._map_risk_code_to_level(risk_code)
            severity = self.severity_mapping.get(risk_level, 'Low')

            # Extract instance information (first instance)
            instance = alert.find('.//zap:instance', namespace)
            if instance is None:
                # Create basic finding without instance details
                return {
                    'title': alert_name,
                    'description': description or alert_name,
                    'severity': severity,
                    'cwe': int(cwe_id) if cwe_id and cwe_id.isdigit() else None,
                    'references': reference,
                    'solution': solution,
                    'false_positive': False,
                    'duplicate': False,
                    'out_of_scope': False,
                    'mitigated': None,
                    'impact': risk_level,
                    'confidence': self._map_confidence_to_level(confidence),
                    'finding_type': 'Vulnerability',
                    'test_type': 'DAST',
                    'static_finding': False,
                    'dynamic_finding': True,
                    'active': True,
                    'verified': False,
                    'scanner_confidence': self._map_confidence_to_level(confidence),
                    'owasp_top_10': self.owasp_mapping.get(alert_name),
                    'tags': ['DAST', 'OWASP ZAP', 'XML Import', 'Web Application'],

                    # Site and scan information
                    'url': site_name,
                    'plugin_id': int(plugin_id) if plugin_id.isdigit() else plugin_id,
                    'wasc_id': int(wasc_id) if wasc_id and wasc_id.isdigit() else None,
                }

            # Extract detailed instance information
            uri = self._get_xml_text(instance, 'uri', site_name)
            method = self._get_xml_text(instance, 'method')
            param = self._get_xml_text(instance, 'param')
            attack = self._get_xml_text(instance, 'attack')
            evidence = self._get_xml_text(instance, 'evidence')

            return {
                'title': alert_name,
                'description': description or alert_name,
                'severity': severity,
                'cwe': int(cwe_id) if cwe_id and cwe_id.isdigit() else None,
                'references': reference,
                'solution': solution,
                'false_positive': False,
                'duplicate': False,
                'out_of_scope': False,
                'mitigated': None,
                'impact': risk_level,
                'confidence': self._map_confidence_to_level(confidence),
                'finding_type': 'Vulnerability',
                'test_type': 'DAST',
                'static_finding': False,
                'dynamic_finding': True,
                'active': True,
                'verified': False,
                'scanner_confidence': self._map_confidence_to_level(confidence),
                'owasp_top_10': self.owasp_mapping.get(alert_name),
                'tags': ['DAST', 'OWASP ZAP', 'XML Import', 'Web Application'],

                # URL and instance information
                'url': uri,
                'param': param,
                'attack': attack,
                'evidence': evidence,
                'method': method,
                'plugin_id': int(plugin_id) if plugin_id.isdigit() else plugin_id,
                'wasc_id': int(wasc_id) if wasc_id and wasc_id.isdigit() else None,
            }

        except Exception as e:
            print(f"⚠️  Error extracting finding from alert: {str(e)}")
            return None

    def _get_xml_text(self, element, tag, default=''):
        """Safely extract text from XML element"""
        found = element.find(f'.//zap:{tag}', {'zap': element.nsmap.get('zap', '')})
        return found.text if found is not None and found.text else default

    def _map_risk_code_to_level(self, risk_code):
        """Map ZAP risk code to readable risk level"""
        try:
            code = int(risk_code)
            if code >= 4:
                return 'High'
            elif code == 3:
                return 'Medium'
            elif code == 2:
                return 'Low'
            else:
                return 'Informational'
        except (ValueError, TypeError):
            return 'Low'

    def _map_confidence_to_level(self, confidence):
        """Map ZAP confidence to readable level"""
        try:
            conf = int(confidence)
            if conf >= 4:
                return 'High'
            elif conf == 3:
                return 'Medium'
            elif conf == 2:
                return 'Low'
            else:
                return 'Low'
        except (ValueError, TypeError):
            return 'Low'

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
            "description": f"Auto-created product for {self.product_name}\n\n**Enhanced DAST Scanner with XML Integration**\n- Repository: {os.getenv('CI_PROJECT_URL', 'unknown')}\n- Commit: {os.getenv('CI_COMMIT_SHORT_SHA', 'unknown')}\n- Branch: {os.getenv('CI_COMMIT_REF_NAME', 'unknown')}",
            "prod_type": 1,  # Web Application
            "tags": ["ci-cd", "automated", "dast", "zap-xml", os.getenv('CI_PROJECT_NAME', 'unknown')]
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
            "description": f"Auto-created engagement for CI/CD pipeline with ZAP XML integration\n\n**Pipeline Details**\n- Repository: {os.getenv('CI_PROJECT_URL', 'unknown')}\n- Commit: {os.getenv('CI_COMMIT_SHORT_SHA', 'unknown')}\n- Branch: {os.getenv('CI_COMMIT_REF_NAME', 'unknown')}\n- Pipeline ID: {os.getenv('CI_PIPELINE_ID', 'unknown')}",
            "product": product_id,
            "target_start": datetime.now().isoformat(),
            "target_end": datetime.now().isoformat(),
            "status": "In Progress",
            "engagement_type": "CI/CD",
            "tags": ["automated", "ci-cd", "dast", "zap-xml", os.getenv('CI_PIPELINE_ID', 'unknown')]
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

    def upload_zap_xml_findings(self, findings, engagement_id, original_file_path):
        """Upload ZAP XML findings to DefectDojo as import scan"""
        try:
            print(f"📤 Uploading {len(findings)} ZAP XML findings to DefectDojo...")

            # Prepare DefectDojo import data with rich metadata
            import_data = {
                'active': True,
                'verified': False,  # Let DefectDojo auto-verify
                'scan_type': 'OWASP ZAP DAST Scan (XML)',
                'minimum_severity': 'Low',
                'engagement': engagement_id,
                'lead': 1,  # Default lead
                'environment': os.getenv('CI_ENVIRONMENT_NAME', 'Development'),
                'version': os.getenv('CI_COMMIT_SHORT_SHA', 'unknown'),
                'build_id': os.getenv('CI_PIPELINE_ID', 'unknown'),
                'commit_hash': os.getenv('CI_COMMIT_SHA', 'unknown'),
                'branch_tag': os.getenv('CI_COMMIT_REF_NAME', 'main'),
                'source_code_management_uri': os.getenv('CI_PROJECT_URL', ''),
                'deduplication_on_engagement': True,

                # Enhanced metadata for XML upload
                'scan_date': datetime.now().isoformat(),
                'import_findings': findings,
                'import_source': 'OWASP ZAP XML Report',
                'import_metadata': {
                    'file_name': os.path.basename(original_file_path),
                    'file_size': os.path.getsize(original_file_path),
                    'scan_type': 'DAST (OWASP ZAP XML)',
                    'parser_version': '1.0.0',
                    'import_timestamp': datetime.now().isoformat()
                }
            }

            upload_url = f"{self.base_url}/api/v2/import-scan/"
            response = requests.post(upload_url, headers=self.headers, json=import_data)

            if response.status_code == 201:
                result = response.json()
                print(f"✅ Successfully uploaded ZAP XML findings (Test ID: {result.get('test', 'N/A')})")
                return True
            else:
                print(f"❌ Failed to upload ZAP XML findings: {response.status_code} - {response.text}")
                return False

        except Exception as e:
            print(f"❌ Exception uploading ZAP XML findings: {str(e)}")
            return False

    def process_zap_xml_upload(self, xml_file_path):
        """Complete workflow to process ZAP XML and upload to DefectDojo"""
        try:
            print(f"🚀 Starting ZAP XML to DefectDojo upload workflow...")
            print(f"📄 XML File: {os.path.basename(xml_file_path)}")
            print(f"📊 File Size: {os.path.getsize(xml_file_path):,} bytes")

            # Validate XML file exists and is readable
            if not os.path.exists(xml_file_path):
                print(f"❌ XML file not found: {xml_file_path}")
                return False

            if os.path.getsize(xml_file_path) == 0:
                print(f"❌ XML file is empty: {xml_file_path}")
                return False

            # Parse XML report
            findings = self.parse_zap_xml_report(xml_file_path)
            if not findings:
                print("⚠️  No findings found in XML report")
                return True  # Not an error, just no findings

            # Create or get product
            product_id = self.create_product_if_not_exists()
            if not product_id:
                print("❌ Failed to create/get product. Aborting upload.")
                return False

            # Create or get engagement
            engagement_id = self.create_engagement_if_not_exists(product_id)
            if not engagement_id:
                print("❌ Failed to create/get engagement. Aborting upload.")
                return False

            print(f"📋 Using Product ID: {product_id}, Engagement ID: {engagement_id}")

            # Upload findings
            upload_success = self.upload_zap_xml_findings(findings, engagement_id, xml_file_path)

            if upload_success:
                # Generate summary report
                self._generate_upload_summary(findings, xml_file_path, engagement_id)

            return upload_success

        except Exception as e:
            print(f"❌ Fatal error in ZAP XML upload workflow: {str(e)}")
            return False

    def _generate_upload_summary(self, findings, xml_file_path, engagement_id):
        """Generate upload summary with detailed statistics"""
        try:
            # Analyze findings by severity
            severity_counts = {'Critical': 0, 'High': 0, 'Medium': 0, 'Low': 0, 'Info': 0}
            owasp_counts = {}

            for finding in findings:
                severity = finding.get('severity', 'Low')
                severity_counts[severity] = severity_counts.get(severity, 0) + 1

                owasp_cat = finding.get('owasp_top_10')
                if owasp_cat:
                    owasp_counts[owasp_cat] = owasp_counts.get(owasp_cat, 0) + 1

            print(f"\n📊 ZAP XML Upload Summary:")
            print(f"   📄 Source File: {os.path.basename(xml_file_path)}")
            print(f"   🔍 Total Findings: {len(findings)}")
            print(f"   📈 Severity Distribution:")
            for severity, count in severity_counts.items():
                if count > 0:
                    print(f"      {severity}: {count}")

            if owasp_counts:
                print(f"   🎯 OWASP Top 10 Distribution:")
                for owasp_cat, count in owasp_counts.items():
                    print(f"      {owasp_cat}: {count}")

            print(f"   🔗 Engagement ID: {engagement_id}")
            print(f"   ⏰ Upload Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

            # Save summary to file
            summary_data = {
                'upload_timestamp': datetime.now().isoformat(),
                'source_file': os.path.basename(xml_file_path),
                'total_findings': len(findings),
                'severity_distribution': severity_counts,
                'owasp_top_10_distribution': owasp_counts,
                'engagement_id': engagement_id,
                'product_name': self.product_name,
                'metadata': {
                    'ci_pipeline_id': os.getenv('CI_PIPELINE_ID'),
                    'ci_commit_sha': os.getenv('CI_COMMIT_SHORT_SHA'),
                    'ci_branch': os.getenv('CI_COMMIT_REF_NAME'),
                    'ci_project_url': os.getenv('CI_PROJECT_URL')
                }
            }

            summary_file = f"zap-xml-upload-summary-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
            with open(summary_file, 'w') as f:
                json.dump(summary_data, f, indent=2)

            print(f"📄 Upload summary saved to: {summary_file}")

        except Exception as e:
            print(f"⚠️  Error generating upload summary: {str(e)}")


def main():
    if len(sys.argv) != 5:
        print("Usage: python3 zap-xml-defectdojo-uploader.py <base_url> <api_key> <product_name> <xml_report_file>")
        print("\nExample:")
        print("  python3 zap-xml-defectdojo-uploader.py https://defectdojo.example.com YOUR_TOKEN nodejs-poc gl-dast-report.xml")
        print("\nEnvironment variables available:")
        print("   CI_PROJECT_URL, CI_COMMIT_REF_NAME, CI_PIPELINE_ID")
        print("   CI_COMMIT_SHORT_SHA, CI_COMMIT_SHA, CI_ENVIRONMENT_NAME")
        sys.exit(1)

    base_url = sys.argv[1]
    api_key = sys.argv[2]
    product_name = sys.argv[3]
    xml_file_path = sys.argv[4]

    # Initialize uploader
    uploader = ZAPXMLDefectDojoUploader(
        base_url=base_url,
        api_key=api_key,
        product_name=product_name
    )

    # Process XML upload
    success = uploader.process_zap_xml_upload(xml_file_path)

    if success:
        print("🎉 ZAP XML to DefectDojo upload completed successfully!")
        sys.exit(0)
    else:
        print("💥 ZAP XML to DefectDojo upload failed!")
        sys.exit(1)


if __name__ == "__main__":
    main()
