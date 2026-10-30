<!-- repomind:pr-comment -->
### 🧠 RepoMind — architecture impact
**+2 components · −1 removed · 4 new risks (1 high+) · cost ↑**

#### ⚠️ New risks
- 🟠 **HIGH** Cloud Run service allows unauthenticated calls — `infra/terraform/main.tf:20`<br/>↳ If this is not a public API, remove allUsers and put it behind IAP or a load balancer with auth.
- ⚪ **LOW** Secret missing from .env.example: KEKA_API_TOKEN — `apps/api/src/modules/auth/keka.ts:3`<br/>↳ Add them to .env.example so new deploys and teammates know they are needed.
- ⚪ **LOW** 3 secrets missing from .env.example: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM — `apps/api/src/modules/auth/otp.ts:2`<br/>↳ Add them to .env.example so new deploys and teammates know they are needed.
- ⚪ **LOW** Secret missing from .env.example: EXPO_ACCESS_TOKEN — `apps/api/src/modules/notifications/push.ts:2`<br/>↳ Add them to .env.example so new deploys and teammates know they are needed.

#### ➕ Added
| Component | Layer | Tech | Cost | Evidence |
| --- | --- | --- | --- | --- |
| Keka | External service | HR platform | $$ per employee (subscription) | `apps/api/src/modules/auth/keka.ts:3` |
| Twilio | External service | SMS & voice | $$ per SMS / call | `apps/api/src/modules/auth/otp.ts:1` |

#### ➖ Removed
| Component | Layer | Tech | Cost | Evidence |
| --- | --- | --- | --- | --- |
| Render | Cloud | Hosting | $$ per instance | `apps/api/render.yaml` |

#### 💸 Cost impact
- ↑ Adds **Keka** · $$ · per employee (subscription)
- ↑ Adds **Twilio** · $$ · per SMS / call
- ↓ Removes **Render** · $$ · per instance

<details open><summary><b>What changed on the map</b></summary>

```mermaid
flowchart LR
  n_ext_keka["Keka<br/><small>HR platform</small>"]
  n_ext_twilio["Twilio<br/><small>SMS & voice</small>"]
  n_host_render["Render<br/><small>Hosting</small>"]
  n_app_apps_api["api<br/><small>Express</small>"]
  n_ext_expo_push["Expo Push<br/><small>Push notifications</small>"]
  n_app_apps_api ==>|new sends| n_ext_expo_push
  n_app_apps_api ==>|new calls| n_ext_keka
  n_app_apps_api ==>|new sends| n_ext_twilio
  n_app_apps_api -.->|removed runs-on| n_host_render
  classDef added fill:#dcfce7,stroke:#16a34a,color:#14532d
  classDef removed fill:#fee2e2,stroke:#dc2626,color:#7f1d1d,stroke-dasharray:4 3
  classDef changed fill:#fef3c7,stroke:#d97706,color:#78350f
  class n_ext_keka,n_ext_twilio added
  class n_host_render removed
```

</details>

<sub>Repo now: 35 components · 70 links · open risks 🔴0 🟠1 🟡2 ⚪4</sub>
