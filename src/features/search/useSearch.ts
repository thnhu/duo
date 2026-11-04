import { useEffect, useState } from 'react';
import { getSearchService, type SearchQuery, type SearchResponse } from '../../search';

// Runs a query against the active SearchService on every change. Only the
// latest query's answer is kept, so a slow earlier one can't overwrite it.
export function useSearch(query: SearchQuery): { response: SearchResponse | null; pending: boolean; failed: boolean } {
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const key = JSON.stringify(query);

  useEffect(() => {
    let current = true;
    setPending(true);
    getSearchService()
      .search(JSON.parse(key) as SearchQuery)
      .then((result) => {
        if (!current) return;
        setResponse(result);
        setFailed(false);
      })
      .catch(() => {
        if (current) setFailed(true);
      })
      .finally(() => {
        if (current) setPending(false);
      });
    return () => {
      current = false;
    };
  }, [key]);

  return { response, pending, failed };
}
