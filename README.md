# 🏡 家庭仪表盘 · Family Dashboard

A colorful, kid-friendly family dashboard for travel planning, household tasks, shopping, and deal monitoring.

## ✨ Modules

| Module | Description |
|--------|-------------|
| 🏠 **Dashboard** | Overview with summary cards, alerts, and activity feeds |
| ✈️ **Trips** | Trip list, travel budget, booking links, packing checklist, member assignments, kids' wishes |
| ✅ **Tasks** | Recurring household tasks (daily/weekly/monthly) with kid reward points |
| 🛒 **Shopping** | Shared shopping list, low-stock alerts, favourite items |
| 🏷️ **Deals** | Promotion import from WeChat messages, auto-extraction, daily digest |
| 📤 **Agency Upload** | Travel agency upload page for promo text, last-minute seats, and image materials |
| 👤 **Login** | WeChat QR login placeholder (swappable for real OAuth) |

## 🚀 Getting Started

```bash
npm install
npm run dev       # development server
npm run build     # production build
npm run preview   # preview production build
```

## 🗂️ Project Structure

```
src/
├── data/              # Local mock JSON data (members, trips, tasks, shopping, deals)
├── utils/             # Utility functions (deal extractor, classifier)
├── components/
│   ├── layout/        # App shell: sidebar navigation
│   ├── dashboard/     # Home page with summary cards
│   ├── trips/         # Trip list, detail, packing checklist, wishes
│   ├── tasks/         # Recurring tasks, points leaderboard
│   ├── shopping/      # Shopping list, low-stock, favourites
│   ├── deals/         # Deal feed, daily digest, message import, agency uploads
│   └── auth/          # Login (WeChat QR placeholder)
├── App.jsx            # Router configuration
└── main.jsx           # Entry point
```

## 📋 Mock Data Files

- `src/data/members.json` — Family members (parents + kids with points)
- `src/data/trips.json` — Trip plans with checklists, assignments, wishes
- `src/data/tasks.json` — Recurring tasks with points
- `src/data/shopping.json` — Shopping items with stock levels
- `src/data/deals.json` — Promotion deals with category & price

## 🔮 Future Roadmap

- Real WeChat QR OAuth login (swap `Login.jsx` → `WeChatQRSection`)
- Automatic WeChat group message ingestion
- AI-powered deal extraction & price-drop alerts
- Backend / database integration
- Full family member role permissions
