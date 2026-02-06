# SPEC-005: Global Search

**Agent:** `search-modal`  
**Priority:** P1 (High Value - UX Multiplier)  
**Est. Tokens:** 70k  
**Dependencies:** None  
**Blocks:** None

---

## 🎯 Objective

Build a Spotlight/Cmd+K style search modal that searches across chats, files, agents, and skills. Fast, keyboard-driven, instantly accessible.

---

## 📋 Requirements

### 1. Search Modal
- **Trigger:** `Cmd+K` (Mac) or `Ctrl+K` (Windows/Linux)
- **Design:** Centered overlay with blur backdrop
- **Responsive:** Full-screen on mobile, centered on desktop
- **Instant results:** Search as you type (debounced 150ms)

### 2. Search Scopes
- 💬 **Chat Messages** - Search message content
- 📁 **Files** - Search file names + content
- 🤖 **Agents** - Search agent tasks/transcripts
- 🛠️ **Skills** - Search skill names/descriptions
- ⚡ **Quick Actions** - Launch features directly

### 3. Result Types

#### Chat Results
```
💬 Chat Result
"...matching text snippet..."
in Session: Main Chat • 2h ago
```

#### File Results
```
📁 File Result
path/to/file.ts
Line 42: ...matching code...
```

#### Agent Results
```
🤖 Agent Result
Task: "Build dashboard widget"
Codex • Completed • 3h ago
```

#### Skill Results
```
🛠️ Skill Result
mission-control
Kanban task management...
```

#### Quick Actions
```
⚡ Quick Action
New Chat Session
Create Terminal
Open Dashboard
```

### 4. Keyboard Navigation
- `↑/↓` - Navigate results
- `Enter` - Open selected result
- `Cmd+[1-9]` - Jump to result by number
- `Tab` - Cycle through scopes
- `Esc` - Close modal

---

## 🧩 Components to Create

### 1. `src/components/search-modal.tsx`
**Main search modal**

```tsx
export function SearchModal() {
  const { isOpen, close } = useSearchModal();
  const [query, setQuery] = useState('');
  const [activeScope, setActiveScope] = useState<SearchScope>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const { data: results, isLoading } = useSearch(query, activeScope);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        isOpen ? close() : open();
      }
      if (e.key === 'Escape') close();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={close}>
      <DialogContent className="search-modal">
        <SearchInput 
          value={query}
          onChange={setQuery}
          placeholder="Search chats, files, agents, skills..."
        />

        <SearchScopes 
          active={activeScope}
          onChange={setActiveScope}
          counts={{
            all: results?.length || 0,
            chats: results?.filter(r => r.type === 'chat').length || 0,
            files: results?.filter(r => r.type === 'file').length || 0,
            agents: results?.filter(r => r.type === 'agent').length || 0,
            skills: results?.filter(r => r.type === 'skill').length || 0,
          }}
        />

        {isLoading ? (
          <SearchSkeleton />
        ) : results && results.length > 0 ? (
          <SearchResults
            results={results}
            selectedIndex={selectedIndex}
            onSelect={(result) => handleSelectResult(result)}
          />
        ) : query ? (
          <EmptyState>No results found</EmptyState>
        ) : (
          <QuickActions />
        )}
      </DialogContent>
    </Dialog>
  );
}
```

### 2. `src/components/search/search-input.tsx`
**Search input with icon**

```tsx
export function SearchInput({ 
  value, 
  onChange, 
  placeholder 
}: { 
  value: string; 
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="search-input-container">
      <Search className="search-icon w-5 h-5 text-muted-foreground" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="search-input"
      />
      {value && (
        <button 
          onClick={() => onChange('')}
          className="clear-button"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
```

### 3. `src/components/search/search-scopes.tsx`
**Scope filter tabs**

```tsx
export function SearchScopes({ 
  active, 
  onChange, 
  counts 
}: { 
  active: SearchScope;
  onChange: (scope: SearchScope) => void;
  counts: Record<SearchScope, number>;
}) {
  const scopes: { value: SearchScope; label: string; icon: any }[] = [
    { value: 'all', label: 'All', icon: Grid },
    { value: 'chats', label: 'Chats', icon: MessageSquare },
    { value: 'files', label: 'Files', icon: File },
    { value: 'agents', label: 'Agents', icon: Bot },
    { value: 'skills', label: 'Skills', icon: Puzzle },
  ];

  return (
    <div className="search-scopes">
      {scopes.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          onClick={() => onChange(value)}
          className={cn("scope-button", {
            active: active === value
          })}
        >
          <Icon className="w-4 h-4" />
          {label}
          {counts[value] > 0 && (
            <Badge variant="secondary" className="ml-2 text-xs">
              {counts[value]}
            </Badge>
          )}
        </button>
      ))}
    </div>
  );
}
```

### 4. `src/components/search/search-results.tsx`
**Results list**

```tsx
export function SearchResults({ 
  results, 
  selectedIndex,
  onSelect 
}: { 
  results: SearchResult[];
  selectedIndex: number;
  onSelect: (result: SearchResult) => void;
}) {
  return (
    <div className="search-results">
      {results.map((result, index) => (
        <SearchResultItem
          key={result.id}
          result={result}
          selected={index === selectedIndex}
          onClick={() => onSelect(result)}
        />
      ))}
    </div>
  );
}
```

### 5. `src/components/search/search-result-item.tsx`
**Individual result card**

```tsx
export function SearchResultItem({ 
  result, 
  selected,
  onClick 
}: { 
  result: SearchResult;
  selected: boolean;
  onClick: () => void;
}) {
  const Icon = getIconForType(result.type);

  return (
    <div
      className={cn("search-result-item", { selected })}
      onClick={onClick}
    >
      <Icon className="result-icon w-5 h-5" />
      
      <div className="result-content">
        <div className="result-title">{result.title}</div>
        {result.snippet && (
          <div className="result-snippet">
            {highlightMatch(result.snippet, result.matchedText)}
          </div>
        )}
        <div className="result-meta">
          {result.meta}
        </div>
      </div>

      {selected && (
        <div className="result-shortcut">
          <Badge variant="outline" className="text-xs">↵</Badge>
        </div>
      )}
    </div>
  );
}
```

---

## 🔌 Data Layer

### Interfaces
```typescript
type SearchScope = 'all' | 'chats' | 'files' | 'agents' | 'skills';

interface SearchResult {
  id: string;
  type: 'chat' | 'file' | 'agent' | 'skill' | 'action';
  title: string;
  snippet?: string;
  matchedText?: string[];
  meta: string; // e.g., "Main Chat • 2h ago"
  url?: string; // Navigation target
  action?: () => void; // For quick actions
}
```

### Hooks

#### `src/hooks/use-search.ts`
```typescript
export function useSearch(query: string, scope: SearchScope) {
  const debouncedQuery = useDebounce(query, 150);

  return useQuery({
    queryKey: ['search', debouncedQuery, scope],
    queryFn: async () => {
      if (!debouncedQuery) return [];

      // Option 1: Call OpenClaw API (if exists)
      // const res = await fetch(`/api/search?q=${debouncedQuery}&scope=${scope}`);
      // return res.json();

      // Option 2: Client-side search
      const results: SearchResult[] = [];

      // Search chats
      if (scope === 'all' || scope === 'chats') {
        const chatResults = await searchChats(debouncedQuery);
        results.push(...chatResults);
      }

      // Search files
      if (scope === 'all' || scope === 'files') {
        const fileResults = await searchFiles(debouncedQuery);
        results.push(...fileResults);
      }

      // Search agents
      if (scope === 'all' || scope === 'agents') {
        const agentResults = await searchAgents(debouncedQuery);
        results.push(...agentResults);
      }

      // Search skills
      if (scope === 'all' || scope === 'skills') {
        const skillResults = await searchSkills(debouncedQuery);
        results.push(...skillResults);
      }

      // Rank results by relevance
      return rankResults(results, debouncedQuery);
    },
    enabled: debouncedQuery.length > 0,
  });
}

async function searchChats(query: string): Promise<SearchResult[]> {
  const sessions = await fetchSessions();
  const results: SearchResult[] = [];

  for (const session of sessions) {
    const messages = await fetchMessages(session.id);
    const matches = messages.filter(m => 
      m.content.toLowerCase().includes(query.toLowerCase())
    );

    for (const message of matches) {
      results.push({
        id: `chat-${session.id}-${message.id}`,
        type: 'chat',
        title: session.name || 'Untitled Chat',
        snippet: message.content.slice(0, 100),
        matchedText: [query],
        meta: `in ${session.name} • ${formatRelativeTime(message.createdAt)}`,
        url: `/chat/${session.id}?highlight=${message.id}`,
      });
    }
  }

  return results;
}
```

#### `src/hooks/use-search-modal.ts`
```typescript
export function useSearchModal() {
  const [isOpen, setIsOpen] = useState(false);

  const open = () => setIsOpen(true);
  const close = () => setIsOpen(false);
  const toggle = () => setIsOpen(prev => !prev);

  return { isOpen, open, close, toggle };
}
```

---

## 🎨 Styling

```css
.search-modal {
  @apply max-w-2xl w-full mx-auto;
  @apply bg-background border border-border rounded-lg shadow-2xl;
  @apply overflow-hidden;
}

.search-input-container {
  @apply flex items-center gap-3 px-4 py-3 border-b border-border;
}

.search-input {
  @apply flex-1 bg-transparent border-none outline-none text-base;
}

.search-scopes {
  @apply flex items-center gap-2 px-4 py-2 border-b border-border overflow-x-auto;
}

.scope-button {
  @apply flex items-center gap-2 px-3 py-1.5 rounded-md text-sm;
  @apply hover:bg-muted transition-colors;
}

.scope-button.active {
  @apply bg-primary text-primary-foreground;
}

.search-results {
  @apply max-h-96 overflow-y-auto;
}

.search-result-item {
  @apply flex items-start gap-3 px-4 py-3 cursor-pointer;
  @apply hover:bg-muted transition-colors;
}

.search-result-item.selected {
  @apply bg-primary/10;
}

.result-content {
  @apply flex-1 min-w-0;
}

.result-title {
  @apply font-medium text-sm;
}

.result-snippet {
  @apply text-xs text-muted-foreground mt-1 line-clamp-2;
}

.result-meta {
  @apply text-xs text-muted-foreground mt-1;
}
```

---

## 🧪 Testing Checklist

- [ ] Cmd+K opens modal
- [ ] Esc closes modal
- [ ] Search input auto-focuses
- [ ] Results appear as you type
- [ ] Scope filters work
- [ ] Keyboard navigation works (↑/↓)
- [ ] Enter selects result
- [ ] Selecting result navigates correctly
- [ ] Empty state shows for no results
- [ ] Quick actions shown when empty
- [ ] Debouncing prevents spam
- [ ] Responsive on mobile

---

## 📦 Dependencies

```bash
npm install use-debounce
```

---

## 🚀 Success Criteria

1. ✅ Instant search across all content
2. ✅ Keyboard-driven UX
3. ✅ Fast, debounced search
4. ✅ Scope filtering
5. ✅ Result highlighting
6. ✅ Quick actions

---

**Estimated Completion:** 3-4 hours
