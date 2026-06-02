import type { Confidence, ReferenceLink, Severity } from '@/types'

export interface VulnTemplate {
  name: string
  severity: Severity
  category: string
  cweId: string
  cveIds: string[]
  cvss: number
  methods: ('GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH')[]
  paths: string[]
  description: string
  evidence: string
  recommendation: string
  references: ReferenceLink[]
  baseConfidence: Confidence
}

const OWASP = (id: string, label: string): ReferenceLink => ({
  label: `OWASP ${label}`,
  url: `https://owasp.org/${id}`,
})

const CWE = (n: number): ReferenceLink => ({
  label: `CWE-${n}`,
  url: `https://cwe.mitre.org/data/definitions/${n}.html`,
})

const NVD = (cve: string): ReferenceLink => ({
  label: cve,
  url: `https://nvd.nist.gov/vuln/detail/${cve}`,
})

// A catalog of realistic web-application findings. The mock engine samples
// a deterministic subset of these per scan, so reports look authentic and
// dashboards stay internally consistent.
export const VULN_CATALOG: VulnTemplate[] = [
  {
    name: 'SQL Injection in query parameter',
    severity: 'critical',
    category: 'SQL Injection',
    cweId: 'CWE-89',
    cveIds: [],
    cvss: 9.8,
    methods: ['GET', 'POST'],
    paths: ['/api/products', '/search', '/login', '/api/orders'],
    description:
      'A boolean-based blind SQL injection was confirmed. The application concatenates the `id` parameter directly into a SQL statement, allowing an attacker to alter query logic and read arbitrary database rows.',
    evidence: "id=4' AND 1=1-- -  →  200 OK   |   id=4' AND 1=2-- -  →  empty result set",
    recommendation:
      'Use parameterised queries / prepared statements for all database access. Apply least-privilege DB accounts and validate input against an allow-list.',
    references: [CWE(89), OWASP('Top10/A03_2021-Injection/', 'A03 Injection')],
    baseConfidence: 'confirmed',
  },
  {
    name: 'OS command injection via filename',
    severity: 'critical',
    category: 'Command Injection',
    cweId: 'CWE-78',
    cveIds: [],
    cvss: 9.4,
    methods: ['POST'],
    paths: ['/api/export', '/upload', '/api/convert'],
    description:
      'User-controlled input is passed to a shell command without sanitisation. A crafted payload achieves remote command execution on the container host.',
    evidence: 'filename=report.pdf;sleep+8  →  response delayed 8.1s (time-based confirmation)',
    recommendation:
      'Never pass user input to a shell. Use language-native APIs, strict allow-lists, and run workloads with minimal OS privileges.',
    references: [CWE(78), OWASP('Top10/A03_2021-Injection/', 'A03 Injection')],
    baseConfidence: 'confirmed',
  },
  {
    name: 'Apache Log4j2 remote code execution (Log4Shell)',
    severity: 'critical',
    category: 'Vulnerable Components',
    cweId: 'CWE-502',
    cveIds: ['CVE-2021-44228'],
    cvss: 10.0,
    methods: ['GET', 'POST'],
    paths: ['/', '/api/login', '/search'],
    description:
      'A vulnerable Log4j2 version reflects a JNDI lookup placed in the User-Agent header, enabling remote code execution via a malicious LDAP endpoint.',
    evidence: 'User-Agent: ${jndi:ldap://canary.sandbox.local/a}  →  outbound LDAP callback observed',
    recommendation:
      'Upgrade Log4j2 to 2.17.1+. Where upgrade is blocked, set `log4j2.formatMsgNoLookups=true` and remove the JndiLookup class.',
    references: [NVD('CVE-2021-44228'), CWE(502)],
    baseConfidence: 'confirmed',
  },
  {
    name: 'Spring Framework RCE (Spring4Shell)',
    severity: 'critical',
    category: 'Vulnerable Components',
    cweId: 'CWE-94',
    cveIds: ['CVE-2022-22965'],
    cvss: 9.8,
    methods: ['POST'],
    paths: ['/api/users', '/account'],
    description:
      'Data binding on a JDK 9+ Spring MVC app allows class-loader manipulation, leading to remote code execution by writing a web shell.',
    evidence: 'class.module.classLoader.resources.context.parent.pipeline.first.* binding accepted',
    recommendation:
      'Upgrade Spring Framework to 5.3.18+/5.2.20+. Restrict `disallowedFields` on the WebDataBinder.',
    references: [NVD('CVE-2022-22965'), CWE(94)],
    baseConfidence: 'firm',
  },
  {
    name: 'Reflected Cross-Site Scripting',
    severity: 'high',
    category: 'Cross-Site Scripting',
    cweId: 'CWE-79',
    cveIds: [],
    cvss: 7.4,
    methods: ['GET'],
    paths: ['/search', '/profile', '/api/feedback'],
    description:
      'The `q` parameter is echoed into the HTML response without output encoding, allowing arbitrary script execution in the victim browser.',
    evidence: 'q=<svg/onload=alert(document.domain)>  →  payload reflected unencoded in <body>',
    recommendation:
      'Context-aware output encoding, a strict Content-Security-Policy, and trusted-types where available.',
    references: [CWE(79), OWASP('www-community/attacks/xss/', 'XSS')],
    baseConfidence: 'firm',
  },
  {
    name: 'Stored Cross-Site Scripting in comments',
    severity: 'high',
    category: 'Cross-Site Scripting',
    cweId: 'CWE-79',
    cveIds: [],
    cvss: 8.2,
    methods: ['POST'],
    paths: ['/api/comments', '/posts', '/reviews'],
    description:
      'Comment bodies are persisted and rendered to other users without sanitisation, enabling a stored XSS worm that can hijack sessions.',
    evidence: 'body=<img src=x onerror=fetch(`/steal?c=${document.cookie}`)> persisted & rendered',
    recommendation:
      'Sanitise on output with a vetted library (DOMPurify), set HttpOnly + SameSite cookies, and deploy CSP.',
    references: [CWE(79), OWASP('Top10/A03_2021-Injection/', 'A03 Injection')],
    baseConfidence: 'confirmed',
  },
  {
    name: 'Server-Side Request Forgery',
    severity: 'high',
    category: 'SSRF',
    cweId: 'CWE-918',
    cveIds: [],
    cvss: 8.6,
    methods: ['POST', 'GET'],
    paths: ['/api/fetch', '/api/webhook', '/api/preview'],
    description:
      'The URL preview feature fetches arbitrary user-supplied URLs, including internal metadata endpoints, exposing cloud credentials.',
    evidence: 'url=http://169.254.169.254/metadata/instance  →  Azure IMDS response returned',
    recommendation:
      'Enforce an allow-list of destinations, block link-local/private ranges, and require IMDSv2-style header tokens.',
    references: [CWE(918), OWASP('Top10/A10_2021-Server-Side_Request_Forgery_%28SSRF%29/', 'A10 SSRF')],
    baseConfidence: 'firm',
  },
  {
    name: 'Broken access control — IDOR on orders',
    severity: 'high',
    category: 'Broken Access Control',
    cweId: 'CWE-639',
    cveIds: [],
    cvss: 8.1,
    methods: ['GET'],
    paths: ['/api/orders', '/api/invoices', '/api/users'],
    description:
      'Object identifiers are sequential and not authorised against the session, allowing one user to read another tenant’s records.',
    evidence: 'GET /api/orders/1042 as user#7  →  200 OK returning user#3 order data',
    recommendation:
      'Enforce per-object authorisation server-side and use unguessable identifiers (UUIDs).',
    references: [CWE(639), OWASP('Top10/A01_2021-Broken_Access_Control/', 'A01 Access Control')],
    baseConfidence: 'confirmed',
  },
  {
    name: 'Authentication bypass via JWT alg confusion',
    severity: 'high',
    category: 'Broken Authentication',
    cweId: 'CWE-347',
    cveIds: [],
    cvss: 8.8,
    methods: ['POST'],
    paths: ['/api/auth/token', '/login', '/api/session'],
    description:
      'The API accepts JWTs signed with `alg:none` or with the public key used as an HMAC secret, permitting token forgery.',
    evidence: 'alg=none token with {"role":"admin"} accepted →  privileged endpoints reachable',
    recommendation:
      'Pin the expected algorithm, reject `none`, and verify signatures with an asymmetric key.',
    references: [CWE(347), OWASP('Top10/A07_2021-Identification_and_Authentication_Failures/', 'A07 Auth')],
    baseConfidence: 'firm',
  },
  {
    name: 'XML External Entity (XXE) injection',
    severity: 'high',
    category: 'XXE',
    cweId: 'CWE-611',
    cveIds: [],
    cvss: 7.7,
    methods: ['POST'],
    paths: ['/api/import', '/soap', '/api/xml'],
    description:
      'The XML parser resolves external entities, allowing local file disclosure and SSRF through crafted DOCTYPE declarations.',
    evidence: '<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]>  →  file contents reflected',
    recommendation:
      'Disable DOCTYPE/external entity resolution in the parser configuration. Prefer JSON where possible.',
    references: [CWE(611), OWASP('www-community/vulnerabilities/XML_External_Entity_(XXE)_Processing', 'XXE')],
    baseConfidence: 'firm',
  },
  {
    name: 'Path traversal in download handler',
    severity: 'high',
    category: 'Path Traversal',
    cweId: 'CWE-22',
    cveIds: [],
    cvss: 7.5,
    methods: ['GET'],
    paths: ['/download', '/api/files', '/static'],
    description:
      'The `file` parameter is used to build a filesystem path without normalisation, permitting traversal outside the intended directory.',
    evidence: 'file=../../../../windows/win.ini  →  200 OK returning system file',
    recommendation:
      'Canonicalise and validate paths against a fixed base directory; serve files by opaque ID.',
    references: [CWE(22), OWASP('www-community/attacks/Path_Traversal', 'Path Traversal')],
    baseConfidence: 'confirmed',
  },
  {
    name: 'Outdated jQuery with known XSS',
    severity: 'medium',
    category: 'Vulnerable Components',
    cweId: 'CWE-1104',
    cveIds: ['CVE-2020-11023', 'CVE-2020-11022'],
    cvss: 6.1,
    methods: ['GET'],
    paths: ['/assets/js/jquery.min.js', '/static/vendor.js'],
    description:
      'jQuery 3.4.x is bundled. Passing HTML containing <option> elements to manipulation methods can execute untrusted code.',
    evidence: 'jQuery v3.4.1 detected in /assets/js/jquery.min.js',
    recommendation: 'Upgrade jQuery to 3.5.0 or later and audit DOM manipulation sinks.',
    references: [NVD('CVE-2020-11023'), CWE(1104)],
    baseConfidence: 'firm',
  },
  {
    name: 'Cross-Site Request Forgery on state change',
    severity: 'medium',
    category: 'CSRF',
    cweId: 'CWE-352',
    cveIds: [],
    cvss: 6.5,
    methods: ['POST'],
    paths: ['/account/email', '/api/settings', '/transfer'],
    description:
      'State-changing requests rely solely on cookies for authentication and lack anti-CSRF tokens.',
    evidence: 'POST /account/email succeeds cross-origin without CSRF token or SameSite protection',
    recommendation:
      'Adopt the synchroniser-token pattern and set SameSite=Lax/Strict on session cookies.',
    references: [CWE(352), OWASP('www-community/attacks/csrf', 'CSRF')],
    baseConfidence: 'firm',
  },
  {
    name: 'Sensitive data exposure — verbose errors',
    severity: 'medium',
    category: 'Information Disclosure',
    cweId: 'CWE-209',
    cveIds: [],
    cvss: 5.3,
    methods: ['GET', 'POST'],
    paths: ['/api/checkout', '/api/users', '/debug'],
    description:
      'Unhandled exceptions return full stack traces, framework versions, and SQL fragments to the client.',
    evidence: 'HTTP 500 body contains stack trace + "Microsoft.Data.SqlClient" connection string fragment',
    recommendation:
      'Return generic error pages, log details server-side only, and disable debug mode in production.',
    references: [CWE(209), OWASP('Top10/A04_2021-Insecure_Design/', 'A04 Insecure Design')],
    baseConfidence: 'confirmed',
  },
  {
    name: 'Missing security headers',
    severity: 'low',
    category: 'Security Headers',
    cweId: 'CWE-693',
    cveIds: [],
    cvss: 3.7,
    methods: ['GET'],
    paths: ['/', '/login', '/dashboard'],
    description:
      'Responses omit Content-Security-Policy, X-Content-Type-Options, and Referrer-Policy, weakening defence-in-depth.',
    evidence: 'No CSP / X-Content-Type-Options header present on the primary document response',
    recommendation:
      'Add CSP, X-Content-Type-Options:nosniff, Referrer-Policy, and Permissions-Policy headers.',
    references: [CWE(693), OWASP('www-project-secure-headers/', 'Secure Headers')],
    baseConfidence: 'confirmed',
  },
  {
    name: 'Cookie without Secure / HttpOnly flags',
    severity: 'low',
    category: 'Security Misconfiguration',
    cweId: 'CWE-614',
    cveIds: [],
    cvss: 4.0,
    methods: ['GET'],
    paths: ['/login', '/'],
    description:
      'The session cookie is set without the Secure and HttpOnly attributes, exposing it to theft over HTTP and via script.',
    evidence: 'Set-Cookie: SESSIONID=…; Path=/   (no Secure, no HttpOnly)',
    recommendation: 'Set Secure, HttpOnly and SameSite attributes on all session cookies.',
    references: [CWE(614), OWASP('www-community/controls/SecureCookieAttribute', 'Secure Cookies')],
    baseConfidence: 'confirmed',
  },
  {
    name: 'TLS configuration permits weak ciphers',
    severity: 'low',
    category: 'TLS/SSL',
    cweId: 'CWE-327',
    cveIds: [],
    cvss: 4.8,
    methods: ['GET'],
    paths: ['/'],
    description:
      'The endpoint negotiates TLS 1.0/1.1 and CBC cipher suites that are deprecated and vulnerable to downgrade attacks.',
    evidence: 'TLS 1.0 enabled; TLS_RSA_WITH_3DES_EDE_CBC_SHA offered',
    recommendation: 'Disable TLS < 1.2, prefer AEAD suites, and enable HSTS.',
    references: [CWE(327), OWASP('www-project-transport-layer-protection-cheat-sheet/', 'TLS')],
    baseConfidence: 'firm',
  },
  {
    name: 'Directory listing enabled',
    severity: 'low',
    category: 'Security Misconfiguration',
    cweId: 'CWE-548',
    cveIds: [],
    cvss: 3.1,
    methods: ['GET'],
    paths: ['/uploads/', '/backup/', '/.git/'],
    description:
      'The web server returns directory indexes, exposing file names and potentially sensitive artefacts.',
    evidence: 'GET /backup/  →  autoindex listing including db_dump.sql',
    recommendation: 'Disable autoindex and remove sensitive artefacts from the web root.',
    references: [CWE(548), OWASP('www-community/attacks/Forced_browsing', 'Forced Browsing')],
    baseConfidence: 'confirmed',
  },
  {
    name: 'Server version disclosed in headers',
    severity: 'info',
    category: 'Information Disclosure',
    cweId: 'CWE-200',
    cveIds: [],
    cvss: 0.0,
    methods: ['GET'],
    paths: ['/'],
    description:
      'The Server and X-Powered-By headers reveal exact software versions, aiding targeted exploitation.',
    evidence: 'Server: Microsoft-IIS/10.0   X-Powered-By: ASP.NET',
    recommendation: 'Suppress version banners on the web server and application framework.',
    references: [CWE(200)],
    baseConfidence: 'confirmed',
  },
  {
    name: 'robots.txt exposes sensitive paths',
    severity: 'info',
    category: 'Information Disclosure',
    cweId: 'CWE-200',
    cveIds: [],
    cvss: 0.0,
    methods: ['GET'],
    paths: ['/robots.txt'],
    description:
      'robots.txt enumerates administrative and staging paths that should not be publicly hinted at.',
    evidence: 'Disallow: /admin/   Disallow: /api/internal/   Disallow: /staging/',
    recommendation: 'Avoid listing sensitive directories; protect them with authentication instead.',
    references: [CWE(200)],
    baseConfidence: 'confirmed',
  },
  {
    name: 'CORS policy allows arbitrary origins',
    severity: 'medium',
    category: 'Security Misconfiguration',
    cweId: 'CWE-942',
    cveIds: [],
    cvss: 5.9,
    methods: ['GET'],
    paths: ['/api/', '/api/profile'],
    description:
      'The API reflects the Origin header into Access-Control-Allow-Origin together with credentials, defeating the same-origin policy.',
    evidence: 'Origin: https://evil.test  →  ACAO: https://evil.test + ACAC: true',
    recommendation: 'Use a strict origin allow-list and never combine wildcard/reflected origins with credentials.',
    references: [CWE(942), OWASP('www-community/attacks/CORS_OriginHeaderScrutiny', 'CORS')],
    baseConfidence: 'firm',
  },
  {
    name: 'Insecure deserialization of session blob',
    severity: 'high',
    category: 'Insecure Deserialization',
    cweId: 'CWE-502',
    cveIds: [],
    cvss: 8.0,
    methods: ['POST'],
    paths: ['/api/session', '/cart'],
    description:
      'A base64 session blob is deserialised without integrity checks, enabling gadget-chain code execution.',
    evidence: 'Tampered pickle/Java blob accepted without HMAC validation',
    recommendation: 'Sign serialised data (HMAC), prefer JSON, and never deserialise untrusted input into objects.',
    references: [CWE(502), OWASP('Top10/A08_2021-Software_and_Data_Integrity_Failures/', 'A08 Integrity')],
    baseConfidence: 'tentative',
  },
  {
    name: 'Open redirect in return URL',
    severity: 'medium',
    category: 'Broken Access Control',
    cweId: 'CWE-601',
    cveIds: [],
    cvss: 5.4,
    methods: ['GET'],
    paths: ['/login', '/logout', '/redirect'],
    description:
      'The `returnUrl` parameter is not validated, enabling phishing redirects to attacker-controlled domains after login.',
    evidence: 'returnUrl=https://evil.test  →  302 redirect to external domain',
    recommendation: 'Validate redirect targets against a server-side allow-list of relative paths.',
    references: [CWE(601), OWASP('www-community/attacks/Unvalidated_Redirects_and_Forwards_Cheat_Sheet', 'Open Redirect')],
    baseConfidence: 'firm',
  },
  {
    name: 'Rate limiting absent on auth endpoint',
    severity: 'medium',
    category: 'Broken Authentication',
    cweId: 'CWE-307',
    cveIds: [],
    cvss: 5.8,
    methods: ['POST'],
    paths: ['/login', '/api/auth/token', '/api/otp'],
    description:
      'The login endpoint imposes no throttling, enabling credential stuffing and brute-force attacks.',
    evidence: '600 login attempts in 60s  →  no lockout, no CAPTCHA, no 429 responses',
    recommendation: 'Add per-account and per-IP rate limiting, exponential backoff, and bot defences.',
    references: [CWE(307), OWASP('www-community/controls/Blocking_Brute_Force_Attacks', 'Brute Force')],
    baseConfidence: 'confirmed',
  },
]
