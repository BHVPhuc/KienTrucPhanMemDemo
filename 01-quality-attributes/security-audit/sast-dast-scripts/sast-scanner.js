const fs = require('fs');
const path = require('path');

// Công cụ quét SAST & SCA tĩnh tự động (tương tự Semgrep + Snyk/Trivy mini)
const TARGET_FILE = path.join(__dirname, '..', 'vulnerable-app', 'server.js');
const PKG_FILE = path.join(__dirname, '..', 'vulnerable-app', 'package.json');

const SAST_RULES = [
  {
    id: 'SEC-001',
    name: 'Hardcoded Secret / API Key',
    severity: 'CRITICAL',
    owasp: 'A07:2021 - Identification and Authentication Failures',
    cwe: 'CWE-798: Use of Hard-coded Credentials',
    regex: /(?:SECRET|API_KEY|PASSWORD|TOKEN)\s*=\s*['"][a-zA-Z0-9_\-]{16,}['"]/i,
    recommendation: 'Di chuyển các khóa bí mật vào biến môi trường (Environment Variables) hoặc Vault (HashiCorp Vault / AWS Secrets Manager).'
  },
  {
    id: 'SEC-002',
    name: 'SQL Injection via String Concatenation',
    severity: 'CRITICAL',
    owasp: 'A03:2021 - Injection',
    cwe: 'CWE-89: SQL Injection',
    regex: /(?:SELECT|INSERT|UPDATE|DELETE).*\$\{.*?\}/i,
    recommendation: 'Sử dụng Parameterized Queries (Prepared Statements) hoặc ORM (Prisma/TypeORM) có cơ chế escape tự động.'
  },
  {
    id: 'SEC-003',
    name: 'Reflected / Stored Cross-Site Scripting (XSS)',
    severity: 'HIGH',
    owasp: 'A03:2021 - Injection (XSS)',
    cwe: 'CWE-79: Cross-site Scripting',
    regex: /res\.send\(.*<[a-z0-9]+>.*\$\{.*?\}.*<\/[a-z0-9]+>.*\)/i,
    recommendation: 'Sử dụng Context-aware Escaping, DOMPurify, Content-Security-Policy (CSP), hoặc trả về định dạng JSON.'
  },
  {
    id: 'SEC-004',
    name: 'Broken Access Control / IDOR (Insecure Direct Object Reference)',
    severity: 'HIGH',
    owasp: 'A01:2021 - Broken Access Control',
    cwe: 'CWE-639: Authorization Bypass Through User-Controlled Key',
    regex: /const\s+\{\s*invoiceId\s*\}\s*=\s*req\.params/i,
    recommendation: 'Bổ sung middleware kiểm tra quyền sở hữu (Ownership Check: invoice.userId === req.user.id) tại tầng dịch vụ.'
  }
];

const KNOWN_VULNERABLE_DEPS = {
  'lodash': {
    affected: '4.17.15',
    cve: 'CVE-2020-8203 / CVE-2021-23337',
    severity: 'HIGH',
    issue: 'Prototype Pollution & Command Injection qua template()',
    fixVersion: '>=4.17.21'
  },
  'jsonwebtoken': {
    affected: '8.5.1',
    cve: 'CVE-2022-23529',
    severity: 'CRITICAL',
    issue: 'Insecure Key Retrieval dẫn tới nguy cơ Remote Code Execution (RCE)',
    fixVersion: '>=9.0.0'
  },
  'serialize-javascript': {
    affected: '2.1.2',
    cve: 'CVE-2020-7660',
    severity: 'CRITICAL',
    issue: 'Arbitrary Code Execution qua hàm serialize không an toàn',
    fixVersion: '>=3.1.0'
  }
};

function runSastAndScaScan() {
  console.log('='.repeat(78));
  console.log('🔍 KHỞI CHẠY QUÉT MÃ NGUỒN TĨNH (SAST) & THƯ VIỆN PHỤ THUỘC (SCA)');
  console.log(`📁 Mục tiêu Code: ${TARGET_FILE}`);
  console.log(`📦 Mục tiêu Deps: ${PKG_FILE}`);
  console.log('='.repeat(78));

  const findings = [];

  // 1. Quét SAST trên server.js
  if (fs.existsSync(TARGET_FILE)) {
    const lines = fs.readFileSync(TARGET_FILE, 'utf-8').split('\n');
    lines.forEach((line, index) => {
      const lineNum = index + 1;
      SAST_RULES.forEach(rule => {
        if (rule.regex.test(line)) {
          findings.push({
            type: 'SAST',
            line: lineNum,
            code: line.trim(),
            ...rule
          });
        }
      });
    });
  }

  // 2. Quét SCA trên package.json (Outdated / Vulnerable Dependencies)
  if (fs.existsSync(PKG_FILE)) {
    const pkg = JSON.parse(fs.readFileSync(PKG_FILE, 'utf-8'));
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    Object.entries(deps).forEach(([depName, version]) => {
      if (KNOWN_VULNERABLE_DEPS[depName] && KNOWN_VULNERABLE_DEPS[depName].affected === version) {
        const vuln = KNOWN_VULNERABLE_DEPS[depName];
        findings.push({
          type: 'SCA (Outdated Dependency)',
          line: 'package.json',
          code: `"${depName}": "${version}"`,
          name: `Vulnerable Dependency: ${depName}@${version} (${vuln.cve})`,
          severity: vuln.severity,
          owasp: 'A06:2021 - Vulnerable and Outdated Components',
          cwe: 'CWE-1104: Use of Unmaintained Third Party Components',
          recommendation: `${vuln.issue}. Nâng cấp ngay lên phiên bản ${vuln.fixVersion}.`
        });
      }
    });
  }

  console.log(`\n🚨 Phát hiện tổng cộng: ${findings.length} lỗ hổng an ninh (SAST + SCA):\n`);

  findings.forEach((f, idx) => {
    console.log(`[${idx + 1}] [${f.severity}] [${f.type}] ${f.name} (Vị trí: ${f.line})`);
    console.log(`    OWASP: ${f.owasp} | ${f.cwe}`);
    console.log(`    Bằng chứng: ${f.code}`);
    console.log(`    Khắc phục:  ${f.recommendation}\n`);
  });

  console.log('⚠️ LƯU Ý QUAN TRỌNG:');
  console.log('   Công cụ SAST/SCA dựa trên mẫu chữ ký KHÔNG phát hiện được lỗi Logic Nghiệp Vụ');
  console.log('   tại dòng 63 (`POST /api/wallet/transfer` cho phép truyền `amount < 0` để rút ruột tiền).');
  console.log('   -> Xem báo cáo AI Audit tại `ai-audit-prompt-reports/ai-audit-comparison.md`!');
  console.log('='.repeat(78));
}

runSastAndScaScan();
