# Missions Tab — Kanban Redesign

## Layout
Full kanban board like a project management tool (Trello/Linear style)

### Columns (left to right):
1. **Draft** — missions being configured, not yet launched
2. **Running** — active missions with live status
3. **Review** — completed missions awaiting review
4. **Done** — archived/completed missions

### "+ New Mission" Button
- Top right of the kanban board
- Opens a popup/modal card (not a full page)
- Fields: Mission Name, Goal (textarea), Team (dropdown), Process Type (Sequential/Hierarchical/Parallel)
- "Launch" button starts the mission immediately
- "Save as Draft" saves to Draft column

### Mission Cards on the Board
Each card shows:
- Mission name/goal (truncated)
- Team name + agent avatar strip
- Status badge (Draft/Running/Review/Done)
- Progress: tasks done / total
- Elapsed time (for running)
- Cost estimate
- Click to expand → full details + agent outputs

### Running Mission Card (expanded)
- Live agent status (who's working, who's idle)
- Task progress bar
- Latest agent output snippet
- Stop/Pause buttons

### Done Mission Card
- "View Report" button
- Task summary
- Cost total
- Artifacts list
