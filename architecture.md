# Sandbox Playground Cyber Platform - Architecture

## System Architecture

```mermaid
flowchart TB
    %% ───────────────────────────────────────────────
    %% FRONTEND
    %% ───────────────────────────────────────────────
    subgraph FRONTEND["Frontend"]
        direction TB
        USER(["User / Browser"])
        REACT["React SPA<br/>(Dashboard & Reports)"]
        USER --> REACT
    end

    %% ───────────────────────────────────────────────
    %% IDENTITY
    %% ───────────────────────────────────────────────
    subgraph IDENTITY["Identity & Access"]
        ENTRA["Microsoft Entra ID<br/>(OAuth 2.0 / OIDC)"]
    end

    %% ───────────────────────────────────────────────
    %% BACKEND
    %% ───────────────────────────────────────────────
    subgraph BACKEND["Backend"]
        FASTAPI["FastAPI Backend<br/>(Azure App Service)"]
    end

    %% ───────────────────────────────────────────────
    %% DATA
    %% ───────────────────────────────────────────────
    subgraph DATA["Data Layer"]
        SQLDB[("Azure SQL Database<br/>(Scan Configs, Users)")]
        COSMOS[("Azure Cosmos DB<br/>(Logs, Results, Events)")]
    end

    %% ───────────────────────────────────────────────
    %% SANDBOX
    %% ───────────────────────────────────────────────
    subgraph SANDBOX["Sandbox Environment"]
        ACR["Azure Container Registry<br/>(ACR)"]
        subgraph ACI["Azure Container Instances"]
            ZAP["OWASP ZAP<br/>Scanner"]
            EXPLOIT["Exploit Scripts<br/>(CVE Validators)"]
        end
    end

    %% ───────────────────────────────────────────────
    %% TARGET
    %% ───────────────────────────────────────────────
    TARGET[/"Target Server<br/>(Scan Subject)"/]

    %% ───────────────────────────────────────────────
    %% AI / ML
    %% ───────────────────────────────────────────────
    subgraph AIML["AI & ML"]
        FOUNDRY["Azure AI Foundry<br/>(LLM CVE Matching)"]
        AZUREML["Azure Machine Learning<br/>(Anomaly Detection)"]
    end

    %% ───────────────────────────────────────────────
    %% MONITORING
    %% ───────────────────────────────────────────────
    subgraph MONITORING["Monitoring & SIEM"]
        SENTINEL["Microsoft Sentinel<br/>(SIEM / Threat Intel)"]
    end

    %% ───────────────────────────────────────────────
    %% CI/CD
    %% ───────────────────────────────────────────────
    subgraph CICD["CI / CD"]
        DEVOPS["GitHub Actions<br/>(Pipelines)"]
    end

    %% ═══════════════════════════════════════════════
    %% FLOWS
    %% ═══════════════════════════════════════════════

    %% 1 - Authentication
    REACT -- "1. Login request" --> ENTRA
    ENTRA -- "JWT / Access Token" --> REACT

    %% 2 - Scan configuration
    REACT -- "2. Configure scan" --> FASTAPI
    FASTAPI -- "Persist config" --> SQLDB

    %% 3 - Container provisioning
    FASTAPI -- "3. Provision container" --> ACI
    ACR -- "Pull image" --> ACI

    %% 4 - Scanning target
    ZAP -- "4. Active / Passive scan" --> TARGET
    EXPLOIT -- "6. Validate vulns" --> TARGET

    %% 5 - AI CVE matching
    ZAP -- "5. Raw findings" --> FOUNDRY
    FOUNDRY -- "Matched CVEs" --> FASTAPI

    %% 6 - Exploit validation (uses CVE results)
    FOUNDRY -. "CVE list" .-> EXPLOIT

    %% 7 - Logging
    FASTAPI -- "7. Write logs" --> COSMOS
    ZAP -- "Scan events" --> COSMOS
    EXPLOIT -- "Exploit results" --> COSMOS

    %% 8 - Anomaly detection
    COSMOS -- "8. Event stream" --> AZUREML
    AZUREML -- "Alerts" --> FASTAPI

    %% 9 - SIEM integration
    COSMOS -- "9. Audit logs" --> SENTINEL
    ENTRA -- "Sign-in logs" --> SENTINEL

    %% 10 - Reporting
    FASTAPI -- "10. Reports & data" --> REACT

    %% CI/CD deployments
    DEVOPS -- "Deploy backend" --> FASTAPI
    DEVOPS -- "Push images" --> ACR

    %% ═══════════════════════════════════════════════
    %% STYLES
    %% ═══════════════════════════════════════════════
    classDef frontendStyle fill:#4FC3F7,stroke:#0277BD,color:#000
    classDef identityStyle fill:#CE93D8,stroke:#6A1B9A,color:#000
    classDef backendStyle fill:#81C784,stroke:#2E7D32,color:#000
    classDef dataStyle fill:#FFD54F,stroke:#F57F17,color:#000
    classDef sandboxStyle fill:#FF8A65,stroke:#BF360C,color:#000
    classDef aiStyle fill:#A5D6A7,stroke:#1B5E20,color:#000
    classDef monitorStyle fill:#EF9A9A,stroke:#B71C1C,color:#000
    classDef cicdStyle fill:#B0BEC5,stroke:#37474F,color:#000
    classDef targetStyle fill:#FFCC80,stroke:#E65100,color:#000

    class USER,REACT frontendStyle
    class ENTRA identityStyle
    class FASTAPI backendStyle
    class SQLDB,COSMOS dataStyle
    class ACR,ZAP,EXPLOIT sandboxStyle
    class FOUNDRY,AZUREML aiStyle
    class SENTINEL monitorStyle
    class DEVOPS cicdStyle
    class TARGET targetStyle
```

### Flow Legend

| Step | Flow | Description |
|------|------|-------------|
| 1 | User --> Entra ID --> React | User authenticates via Microsoft Entra ID (OAuth 2.0 / OIDC) |
| 2 | React --> FastAPI --> Azure SQL | User configures a penetration test scan; config is persisted |
| 3 | FastAPI --> ACI (pulls from ACR) | Backend provisions an isolated container instance for the scan |
| 4 | ZAP --> Target Server | OWASP ZAP performs active and passive scanning against the target |
| 5 | ZAP --> AI Foundry --> FastAPI | Raw scan findings are sent to Azure AI Foundry for LLM-based CVE matching |
| 6 | Exploit Scripts --> Target Server | Exploit scripts validate discovered vulnerabilities against the target |
| 7 | All components --> Cosmos DB | Scan events, exploit results, and API logs are written to Cosmos DB |
| 8 | Cosmos DB --> Azure ML | Event streams feed anomaly detection models in Azure Machine Learning |
| 9 | Cosmos DB + Entra ID --> Sentinel | Audit logs and sign-in events are ingested by Microsoft Sentinel (SIEM) |
| 10 | FastAPI --> React | Aggregated reports and dashboards are served back to the user |

---

## Scan Lifecycle - Sequence Diagram

```mermaid
sequenceDiagram
    autonumber

    actor User
    participant React as React SPA
    participant FastAPI as FastAPI Backend
    participant ACI as ACI Container
    participant ZAP as OWASP ZAP
    participant AI as Azure AI Foundry
    participant Cosmos as Cosmos DB

    Note over User,Cosmos: ---- Authentication Phase ----
    User->>React: Open application
    React->>React: Redirect to Entra ID login
    React-->>User: Authenticated (JWT)

    Note over User,Cosmos: ---- Scan Configuration Phase ----
    User->>React: Configure scan parameters
    React->>FastAPI: POST /api/scans (target, scope, options)
    FastAPI->>FastAPI: Validate & persist config (Azure SQL)
    FastAPI-->>React: 201 Created (scan_id)
    React-->>User: Scan queued confirmation

    Note over User,Cosmos: ---- Container Provisioning Phase ----
    FastAPI->>ACI: Provision container (image from ACR)
    ACI-->>FastAPI: Container running (endpoint)
    FastAPI->>Cosmos: Log: container_provisioned

    Note over User,Cosmos: ---- Scanning Phase ----
    FastAPI->>ZAP: Start scan (target URL, policy)
    ZAP->>ZAP: Active & passive scan execution

    loop Progress Polling
        React->>FastAPI: GET /api/scans/{id}/status
        FastAPI-->>React: { status: "scanning", progress: N% }
        React-->>User: Update progress bar
    end

    ZAP-->>FastAPI: Scan complete (raw findings)
    FastAPI->>Cosmos: Log: scan_completed (raw results)

    Note over User,Cosmos: ---- AI Analysis Phase ----
    FastAPI->>AI: POST /analyze (raw findings)
    AI->>AI: LLM processes findings
    AI->>AI: Match against CVE database
    AI-->>FastAPI: Enriched results (CVE IDs, severity, CVSS)
    FastAPI->>Cosmos: Log: ai_analysis_completed

    Note over User,Cosmos: ---- Exploit Validation Phase ----
    FastAPI->>ACI: Execute exploit scripts (matched CVEs)
    ACI->>ACI: Run targeted exploit validation
    ACI-->>FastAPI: Validation results (confirmed / false positive)
    FastAPI->>Cosmos: Log: exploit_validation_completed

    Note over User,Cosmos: ---- Reporting Phase ----
    FastAPI->>FastAPI: Generate final report
    FastAPI->>Cosmos: Log: report_generated
    FastAPI-->>React: Full report payload
    React-->>User: Display interactive dashboard

    Note over User,Cosmos: ---- Cleanup Phase ----
    FastAPI->>ACI: Terminate container
    ACI-->>FastAPI: Container destroyed
    FastAPI->>Cosmos: Log: container_terminated
```

### Sequence Diagram Notes

- **Authentication** uses Microsoft Entra ID with OAuth 2.0 authorization code flow. The React SPA receives a JWT that is attached to every subsequent API call.
- **Container isolation** ensures each scan runs in a dedicated Azure Container Instance, preventing cross-scan interference and providing a clean environment.
- **Progress polling** keeps the user informed. A future enhancement could replace polling with WebSocket-based real-time updates.
- **AI analysis** leverages a large language model hosted in Azure AI Foundry to correlate raw scanner output with known CVEs, reducing manual triage effort.
- **Exploit validation** acts as a confirmation step -- only vulnerabilities that can be actively demonstrated are flagged as "confirmed," reducing false positive noise.
- **Cleanup** is automatic: containers are terminated and deallocated once the scan lifecycle completes, keeping infrastructure costs predictable.
