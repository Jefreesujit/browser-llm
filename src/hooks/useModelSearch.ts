import { startTransition, useDeferredValue, useEffect, useState } from "react";

import { uniqueModelsById } from "../app/chat-helpers";
import {
  getCompatibilityReport,
  shouldShowSearchModel,
} from "../compatibility";
import { searchHubModels } from "../hf";
import { searchCatalogModels } from "../models";
import type {
  DeviceCapabilities,
  LocalModelVerdictCache,
  ModelDescriptor,
  PickerTab,
  SearchFilters,
} from "../types";

type UseModelSearchParams = {
  pickerOpen: boolean;
  pickerTab: PickerTab;
  searchFilters: SearchFilters;
  deviceCapabilities: DeviceCapabilities;
  localVerdicts: LocalModelVerdictCache;
};

export const useModelSearch = ({
  pickerOpen,
  pickerTab,
  searchFilters,
  deviceCapabilities,
  localVerdicts,
}: UseModelSearchParams) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ModelDescriptor[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  useEffect(() => {
    if (!pickerOpen || pickerTab !== "search" || !deferredSearchQuery.trim()) {
      setSearchResults([]);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    const catalogMatches = searchCatalogModels(deferredSearchQuery);

    setSearchLoading(true);
    setSearchError(null);

    searchHubModels(deferredSearchQuery, searchFilters, deviceCapabilities)
      .then((models) => {
        if (cancelled) {
          return;
        }

        const compatibleModels = uniqueModelsById([
          ...catalogMatches,
          ...models,
        ])
          .map((model) => ({
            ...model,
            compatibility: getCompatibilityReport(
              model,
              deviceCapabilities,
              localVerdicts,
            ),
          }))
          .filter((model) =>
            shouldShowSearchModel(
              model,
              searchFilters,
              deviceCapabilities,
              localVerdicts,
            ),
          );

        startTransition(() => setSearchResults(compatibleModels));
      })
      .catch((searchIssue) => {
        if (cancelled) {
          return;
        }

        const fallbackMatches = catalogMatches
          .map((model) => ({
            ...model,
            compatibility: getCompatibilityReport(
              model,
              deviceCapabilities,
              localVerdicts,
            ),
          }))
          .filter((model) =>
            shouldShowSearchModel(
              model,
              searchFilters,
              deviceCapabilities,
              localVerdicts,
            ),
          );

        if (fallbackMatches.length > 0) {
          startTransition(() => setSearchResults(fallbackMatches));
          setSearchError(null);
          return;
        }

        setSearchError(
          searchIssue instanceof Error
            ? searchIssue.message
            : "Unable to search compatible models right now.",
        );
      })
      .finally(() => {
        if (!cancelled) {
          setSearchLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    deferredSearchQuery,
    deviceCapabilities,
    localVerdicts,
    pickerOpen,
    pickerTab,
    searchFilters,
  ]);

  return {
    searchQuery,
    searchResults,
    searchLoading,
    searchError,
    setSearchQuery,
  };
};
