# SPEC-002: Skills Browser

**Agent:** `skills-browser`  
**Priority:** P0 (Critical - User Value)  
**Est. Tokens:** 120k  
**Dependencies:** None  
**Enables:** Skill marketplace, one-click installs

---

## 🎯 Objective

Build a complete skills browser that allows users to:
1. Browse installed skills
2. Search ClawdHub marketplace (3,000+ skills)
3. Install/uninstall skills with one click
4. View skill details (README, triggers, config)
5. Enable/disable skills
6. Update skills

---

## 📋 Requirements

### 1. Skills Route
- **Path:** `/skills`
- **Component:** `src/screens/skills/skills-screen.tsx`
- **Layout:** Tab-based interface (Installed | ClawdHub | Marketplace)

### 2. Tabs

#### Tab 1: Installed Skills
- Show all skills in `~/.openclaw/workspace/skills/`
- Parse `SKILL.md` for metadata
- Enable/disable toggle
- Uninstall button
- Update available badge

#### Tab 2: ClawdHub
- Search 3,000+ community skills
- Filter by category
- Sort by popularity/recent
- One-click install
- Show install status

#### Tab 3: Marketplace (Future)
- Curated featured skills
- Staff picks
- Trending this week
- New releases

### 3. Skill Card Design

**Compact View (Grid)**
```
┌─────────────────────────┐
│ 🎨 [Icon] Skill Name    │
│ by @author              │
│                         │
│ Short description...    │
│                         │
│ [Install] [Details]     │
└─────────────────────────┘
```

**Detailed View (Modal)**
```
┌──────────────────────────────────────────────┐
│ ← Back                                       │
│                                              │
│ 🎨 Skill Name                                │
│ by @author · v1.2.3 · ⭐ 245                 │
│                                              │
│ Description (full)                           │
│                                              │
│ ## Triggers                                  │
│ - "trigger phrase"                           │
│ - "another trigger"                          │
│                                              │
│ ## Installation                              │
│ npx clawhub@latest install skill-slug        │
│                                              │
│ ## Documentation                             │
│ [README content from SKILL.md]               │
│                                              │
│ [Install Skill] [Visit Homepage]             │
└──────────────────────────────────────────────┘
```

---

## 🧩 Components to Create

### 1. `src/screens/skills/skills-screen.tsx`
**Main skills browser**

```tsx
export function SkillsScreen() {
  const [activeTab, setActiveTab] = useState<'installed' | 'clawhub' | 'marketplace'>('installed');

  return (
    <div className="skills-screen">
      <SkillsHeader />
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="installed">Installed</TabsTrigger>
          <TabsTrigger value="clawhub">ClawdHub</TabsTrigger>
          <TabsTrigger value="marketplace">Marketplace</TabsTrigger>
        </TabsList>
        
        <TabsContent value="installed">
          <InstalledSkillsTab />
        </TabsContent>
        
        <TabsContent value="clawhub">
          <ClawdHubTab />
        </TabsContent>
        
        <TabsContent value="marketplace">
          <MarketplaceTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

### 2. `src/screens/skills/components/installed-skills-tab.tsx`
**Installed skills grid**

```tsx
export function InstalledSkillsTab() {
  const { data: skills, isLoading } = useInstalledSkills();
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = skills?.filter(skill =>
    skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    skill.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="installed-skills-tab">
      <div className="search-bar">
        <Input
          placeholder="Search installed skills..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {isLoading ? (
        <SkillsGridSkeleton />
      ) : (
        <div className="skills-grid">
          {filtered?.map(skill => (
            <SkillCard key={skill.slug} skill={skill} installed />
          ))}
        </div>
      )}
    </div>
  );
}
```

### 3. `src/screens/skills/components/clawhub-tab.tsx`
**ClawdHub marketplace**

```tsx
export function ClawdHubTab() {
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const { data: skills, isLoading } = useClawdHubSkills({ searchQuery, category });

  return (
    <div className="clawhub-tab">
      <div className="filters">
        <Input
          placeholder="Search 3,000+ skills..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <Select value={category || 'all'} onValueChange={setCategory}>
          <SelectTrigger>
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="coding">Coding Agents</SelectItem>
            <SelectItem value="web">Web Development</SelectItem>
            <SelectItem value="devops">DevOps & Cloud</SelectItem>
            <SelectItem value="productivity">Productivity</SelectItem>
            {/* Add all categories from awesome-openclaw-skills */}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <SkillsGridSkeleton />
      ) : (
        <div className="skills-grid">
          {skills?.map(skill => (
            <SkillCard key={skill.slug} skill={skill} />
          ))}
        </div>
      )}
    </div>
  );
}
```

### 4. `src/screens/skills/components/skill-card.tsx`
**Individual skill card**

```tsx
interface SkillCardProps {
  skill: Skill;
  installed?: boolean;
}

export function SkillCard({ skill, installed }: SkillCardProps) {
  const { mutate: installSkill, isLoading: installing } = useInstallSkill();
  const { mutate: uninstallSkill } = useUninstallSkill();
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <>
      <Card className="skill-card">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <SkillIcon type={skill.type} />
              <div>
                <CardTitle className="text-base">{skill.name}</CardTitle>
                <CardDescription className="text-xs">
                  by {skill.author || 'Unknown'}
                </CardDescription>
              </div>
            </div>
            {installed && (
              <Switch
                checked={skill.enabled}
                onCheckedChange={(enabled) => toggleSkill(skill.slug, enabled)}
              />
            )}
          </div>
        </CardHeader>
        
        <CardContent>
          <p className="text-sm text-muted-foreground line-clamp-3">
            {skill.description}
          </p>
          
          {skill.triggers?.length > 0 && (
            <div className="triggers mt-2">
              <span className="text-xs font-medium">Triggers:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {skill.triggers.slice(0, 2).map(trigger => (
                  <Badge key={trigger} variant="secondary" className="text-xs">
                    {trigger}
                  </Badge>
                ))}
                {skill.triggers.length > 2 && (
                  <Badge variant="secondary" className="text-xs">
                    +{skill.triggers.length - 2} more
                  </Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
        
        <CardFooter className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => setDetailsOpen(true)}
          >
            Details
          </Button>
          {installed ? (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => uninstallSkill(skill.slug)}
            >
              Uninstall
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => installSkill(skill.slug)}
              disabled={installing}
            >
              {installing ? 'Installing...' : 'Install'}
            </Button>
          )}
        </CardFooter>
      </Card>

      <SkillDetailModal
        skill={skill}
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
      />
    </>
  );
}
```

### 5. `src/screens/skills/components/skill-detail-modal.tsx`
**Detailed skill view**

```tsx
export function SkillDetailModal({ 
  skill, 
  open, 
  onClose 
}: { 
  skill: Skill; 
  open: boolean; 
  onClose: () => void;
}) {
  const { data: readme } = useSkillReadme(skill.slug);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-2xl">{skill.name}</DialogTitle>
              <DialogDescription className="text-sm mt-1">
                by {skill.author} · v{skill.version} · {skill.stars ? `⭐ ${skill.stars}` : ''}
              </DialogDescription>
            </div>
            <Badge variant={skill.enabled ? 'default' : 'secondary'}>
              {skill.enabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>
        </DialogHeader>

        <div className="skill-details space-y-6">
          <div>
            <h3 className="font-semibold mb-2">Description</h3>
            <p className="text-sm text-muted-foreground">{skill.description}</p>
          </div>

          {skill.triggers?.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">Triggers</h3>
              <ul className="list-disc list-inside space-y-1">
                {skill.triggers.map(trigger => (
                  <li key={trigger} className="text-sm">"{trigger}"</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h3 className="font-semibold mb-2">Installation</h3>
            <pre className="bg-muted p-3 rounded-md text-xs">
              npx clawhub@latest install {skill.slug}
            </pre>
          </div>

          {readme && (
            <div>
              <h3 className="font-semibold mb-2">Documentation</h3>
              <div className="prose prose-sm dark:prose-invert">
                <ReactMarkdown>{readme}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {skill.homepage && (
            <Button variant="outline" asChild>
              <a href={skill.homepage} target="_blank" rel="noopener noreferrer">
                Visit Homepage
              </a>
            </Button>
          )}
          {skill.installed ? (
            <Button variant="destructive">Uninstall</Button>
          ) : (
            <Button>Install Skill</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

---

## 🔌 Data Layer

### Skill Interface
```typescript
interface Skill {
  slug: string; // folder name (e.g., "mission-control")
  name: string; // human-readable name
  description: string;
  author?: string;
  version?: string;
  homepage?: string;
  triggers?: string[];
  tags?: string[];
  category?: string;
  stars?: number; // from GitHub
  installed: boolean;
  enabled: boolean;
  path?: string; // local filesystem path (if installed)
  readme?: string; // SKILL.md content
  lastUpdated?: string;
}
```

### Hooks

#### `src/screens/skills/hooks/use-installed-skills.ts`
```typescript
export function useInstalledSkills() {
  return useQuery({
    queryKey: ['skills', 'installed'],
    queryFn: async () => {
      // Option 1: Call OpenClaw API (if exists)
      // const res = await fetch('/api/skills');
      // return res.json();

      // Option 2: Read local filesystem
      const skills: Skill[] = [];
      const skillsDir = '~/.openclaw/workspace/skills/';
      
      // Use exec to list directories
      const { stdout } = await exec(`ls -1 ${skillsDir}`);
      const folders = stdout.trim().split('\n');

      for (const folder of folders) {
        try {
          const skillMd = await readFile(`${skillsDir}/${folder}/SKILL.md`, 'utf-8');
          const metadata = parseSkillMetadata(skillMd);
          skills.push({
            slug: folder,
            ...metadata,
            installed: true,
            enabled: await isSkillEnabled(folder),
            path: `${skillsDir}/${folder}`
          });
        } catch (err) {
          void err;
        }
      }

      return skills;
    },
    staleTime: 60000, // 1 minute
  });
}

function parseSkillMetadata(skillMd: string): Partial<Skill> {
  // Parse YAML frontmatter
  const match = skillMd.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const yaml = match[1];
  return {
    name: yaml.match(/name:\s*(.+)/)?.[1],
    description: yaml.match(/description:\s*(.+)/)?.[1],
    homepage: yaml.match(/homepage:\s*(.+)/)?.[1],
    // ... parse other fields
  };
}
```

#### `src/screens/skills/hooks/use-clawhub-skills.ts`
```typescript
interface ClawdHubSearchParams {
  searchQuery?: string;
  category?: string | null;
  page?: number;
}

export function useClawdHubSkills(params: ClawdHubSearchParams) {
  return useQuery({
    queryKey: ['skills', 'clawhub', params],
    queryFn: async () => {
      // Option 1: Official ClawdHub API (if it exists)
      // const res = await fetch(`https://api.clawhub.com/skills?q=${params.searchQuery}`);
      // return res.json();

      // Option 2: Scrape GitHub openclaw/skills repo
      const res = await fetch('https://api.github.com/repos/openclaw/skills/contents/skills');
      const folders = await res.json();

      const skills: Skill[] = [];
      
      for (const folder of folders) {
        if (folder.type !== 'dir') continue;
        
        try {
          const skillUrl = `https://raw.githubusercontent.com/openclaw/skills/main/skills/${folder.name}/SKILL.md`;
          const skillMd = await fetch(skillUrl).then(r => r.text());
          const metadata = parseSkillMetadata(skillMd);
          
          skills.push({
            slug: folder.name,
            ...metadata,
            installed: false,
            enabled: false,
          });
        } catch (err) {
          void err;
        }
      }

      // Filter by search query
      let filtered = skills;
      if (params.searchQuery) {
        const query = params.searchQuery.toLowerCase();
        filtered = skills.filter(s =>
          s.name.toLowerCase().includes(query) ||
          s.description.toLowerCase().includes(query)
        );
      }

      // Filter by category
      if (params.category && params.category !== 'all') {
        filtered = filtered.filter(s => s.category === params.category);
      }

      return filtered;
    },
    staleTime: 300000, // 5 minutes
  });
}
```

#### `src/screens/skills/hooks/use-install-skill.ts`
```typescript
export function useInstallSkill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (slug: string) => {
      // Call OpenClaw API or use exec
      await exec(`npx clawhub@latest install ${slug}`);
      return slug;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['skills', 'installed']);
      toast.success('Skill installed successfully');
    },
    onError: (error) => {
      toast.error(`Failed to install skill: ${error.message}`);
    },
  });
}
```

#### `src/screens/skills/hooks/use-uninstall-skill.ts`
```typescript
export function useUninstallSkill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (slug: string) => {
      const skillPath = `~/.openclaw/workspace/skills/${slug}`;
      await exec(`rm -rf ${skillPath}`);
      return slug;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['skills', 'installed']);
      toast.success('Skill uninstalled');
    },
  });
}
```

---

## 🎨 Styling

```css
/* src/screens/skills/skills.css */

.skills-screen {
  @apply p-6 h-full flex flex-col;
}

.skills-grid {
  @apply grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4;
}

.skill-card {
  @apply flex flex-col h-full;
}

.skill-card .card-content {
  @apply flex-1;
}

.skill-detail-modal .prose {
  @apply max-w-none;
}

.skill-detail-modal .prose pre {
  @apply bg-muted;
}
```

---

## 🧪 Testing Checklist

- [ ] Installed tab shows local skills
- [ ] ClawdHub tab loads marketplace
- [ ] Search filters skills correctly
- [ ] Category filter works
- [ ] Install button → skill downloads
- [ ] Uninstall button → skill removes
- [ ] Enable/disable toggle persists
- [ ] Skill detail modal opens
- [ ] README renders correctly
- [ ] Homepage link opens externally
- [ ] No duplicate skills shown
- [ ] Loading states work
- [ ] Error handling for failed installs
- [ ] Responsive on mobile

---

## 📦 Dependencies to Add

```json
{
  "react-markdown": "^9.0.1",
  "gray-matter": "^4.0.3"
}
```

Install:
```bash
npm install react-markdown gray-matter
```

---

## 🚀 Success Criteria

1. ✅ Browse installed skills
2. ✅ Search ClawdHub marketplace
3. ✅ Install skills with one click
4. ✅ Uninstall skills
5. ✅ Enable/disable skills
6. ✅ View skill README
7. ✅ Filter by category
8. ✅ Responsive design

---

**Estimated Completion:** 4-5 hours (Codex full-auto mode)
