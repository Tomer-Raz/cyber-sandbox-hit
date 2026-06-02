# Azure Resources Needed

List of Azure things to create for this project.

## 1. Resource Group
One group to hold everything. Example name: `rg-cyber-sandbox-hit`.

## 2. Entra ID (Login)
- App registration for React (frontend login)
- App registration for FastAPI (backend API)

## 3. Key Vault
Store secrets, passwords, API keys. No secrets in code.

## 4. App Service
Runs FastAPI backend. Python 3.11. Linux plan.

## 5. Container Registry (ACR)
Stores the scanner Docker image.

## 6. Container Instances (ACI)
Runs the scanner. Windows containers. Created when scan starts, deleted when done.

## 7. Azure SQL Database
Serverless. Stores users and scan configs.

## 8. Cosmos DB
Serverless. Stores scan logs, AI results, events.

## 9. Azure AI Foundry
Runs the LLM that matches scan results to CVEs.

## 10. Azure Machine Learning
Runs anomaly detection on scan logs.

## 11. Log Analytics Workspace
Collects all logs in one place.

## 12. Microsoft Sentinel
SIEM. Reads logs, finds threats.

## 13. Application Insights
Tracks app performance and errors.

## 14. GitHub Actions Setup (not Azure, but needs Azure access)
Service principal so GitHub can deploy to Azure.

## 15. Static Web Apps
Hosts React SPA. Free SKU. Auto-deploys from GitHub on push to `main`. Built-in CDN, HTTPS, custom domain. Backend (FastAPI App Service) must allow Static Web App origin in CORS.

---

## Quick Table

| # | Resource | Why |
|---|----------|-----|
| 1 | Resource Group | Hold everything |
| 2 | Entra ID Apps | User login |
| 3 | Key Vault | Store secrets |
| 4 | App Service | Run backend |
| 5 | Container Registry | Store image |
| 6 | Container Instances | Run scanner |
| 7 | Azure SQL | User + config data |
| 8 | Cosmos DB | Logs + results |
| 9 | AI Foundry | CVE matching |
| 10 | Machine Learning | Anomaly detection |
| 11 | Log Analytics | Collect logs |
| 12 | Sentinel | Threat detection |
| 13 | App Insights | App monitoring |
| 14 | GitHub Service Principal | CI/CD access |
| 15 | Static Web Apps | Host React frontend |

## Build Order
1. Resource Group + Key Vault
2. Entra ID apps
3. SQL + Cosmos DB
4. ACR + App Service
5. Static Web Apps
6. AI Foundry + ML
7. Log Analytics + Sentinel + App Insights
8. GitHub Actions hookup
