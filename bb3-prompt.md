# Claude Code Prompt — Build BebeBills 3

Read the file `bebebills3.md` in this folder. That is your full spec. Build the entire app according to it.

A few things to do before you start coding:

1. Create a new folder called `bebebills3/` and build everything inside it.
2. Follow the file structure in the spec exactly.
3. Use the tech stack in the spec: Node.js + Express backend, React + Vite frontend, Node 24 built-in SQLite for local dev, plain CSS (no Tailwind, no component libraries).
4. When you're done, make sure `npm run dev` starts both server and client and the app is fully usable locally.

---

When you're done, verify:
- [ ] I can sign up with two partner names
- [ ] I can add a top-level expense with paid_by, amount, split, date
- [ ] I can expand a row and add a sub-item to it
- [ ] A parent row correctly shows the sum of its children's amounts and the net balance contribution
- [ ] The footer shows the live balance
- [ ] Settings modal opens from footer, lets me edit partner names, export CSV, change password
- [ ] CSV export downloads the raw expenses and settlements tables
- [ ] No colors, no charts, no recurring expenses anywhere in the app
