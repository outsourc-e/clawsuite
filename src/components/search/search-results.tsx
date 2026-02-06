import {
  SearchResultItem
  
} from './search-result-item'
import type {SearchResultItemData} from './search-result-item';

type SearchResultsProps = {
  query: string
  results: Array<SearchResultItemData>
  selectedIndex: number
  onHoverIndex: (index: number) => void
  onSelectIndex: (index: number) => void
}

export function SearchResults({
  query,
  results,
  selectedIndex,
  onHoverIndex,
  onSelectIndex,
}: SearchResultsProps) {
  if (results.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/50 p-8 text-center text-sm text-muted-foreground text-pretty">
        No matches found for <span className="font-medium">“{query}”</span>.
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {results.map((result, index) => (
        <SearchResultItem
          key={result.id}
          item={result}
          selected={index === selectedIndex}
          query={query}
          shortcut={index < 9 ? index + 1 : undefined}
          onHover={() => onHoverIndex(index)}
          onSelect={() => onSelectIndex(index)}
        />
      ))}
    </div>
  )
}

export type { SearchResultItemData }
