// The chat's outer frame: drop target, resizable panel group, artifacts panel.
//
// Two unrelated responsibilities, both of which need to sit above the conversation.
//
// The artifacts panel is render-gated on three conditions — the visibility
// preference, a non-empty artifact set, and `currentArtifactId != null`. The third
// is the interesting one: navigation resets the focused id, so revisiting an old
// conversation full of artifacts leaves the panel closed. Artifacts arriving live
// re-open it by auto-focusing on mount. `three`-heavy artifact rendering is behind
// `lazy` so it is never fetched until a panel actually opens.
//
// The mount effect sweeps abandoned uploads: files recorded in
// `FILES_TO_DELETE` (see hooks/Files/useSetFilesToDelete.ts) are attachments the
// user picked and never sent, possibly in a tab that was closed. This is the only
// place that garbage collection happens.

import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import { FileSources, LocalStorageKeys } from 'librechat-data-provider';
import type { ExtendedFile } from '~/common';
import useResetArtifactsOnConversationChange from '~/hooks/Artifacts/useResetArtifactsOnConversationChange';
import DragDropWrapper from '~/components/Chat/Input/Files/DragDropWrapper';
import { EditorProvider, ArtifactsProvider } from '~/Providers';
import { useDeleteFilesMutation } from '~/data-provider';
import { SidePanelGroup } from '~/components/SidePanel';
import { useSetFilesToDelete } from '~/hooks';
import store from '~/store';

const Artifacts = lazy(() => import('~/components/Artifacts/Artifacts'));

export default function Presentation({ children }: { children: React.ReactNode }) {
  const artifacts = useRecoilValue(store.artifactsState);
  const artifactsVisibility = useRecoilValue(store.artifactsVisibility);
  // Render-gating the panel on `currentArtifactId != null` (in addition
  // to visibility + non-empty artifacts) means the side panel only opens
  // when *something* is actively focused. Conversation navigation
  // resets `currentArtifactId` to null, so the panel stays closed when
  // a user revisits an old conversation full of artifacts. New artifacts
  // arriving via SSE auto-focus through `ToolArtifactCard`'s mount effect
  // (gated on `isSubmitting`), restoring the legacy streaming UX.
  const currentArtifactId = useRecoilValue(store.currentArtifactId);

  useResetArtifactsOnConversationChange();

  const setFilesToDelete = useSetFilesToDelete();

  const { mutateAsync } = useDeleteFilesMutation({
    onSuccess: () => {
      console.log('Temporary Files deleted');
      setFilesToDelete({});
    },
    onError: (error) => {
      console.log('Error deleting temporary files:', error);
    },
  });

  useEffect(() => {
    const filesToDelete = localStorage.getItem(LocalStorageKeys.FILES_TO_DELETE);
    const map = JSON.parse(filesToDelete ?? '{}') as Record<string, ExtendedFile>;
    const files = Object.values(map)
      .filter(
        (file) =>
          file.filepath != null && file.source && !(file.embedded ?? false) && file.temp_file_id,
      )
      .map((file) => ({
        file_id: file.file_id,
        filepath: file.filepath as string,
        source: file.source as FileSources,
        embedded: !!(file.embedded ?? false),
      }));

    if (files.length === 0) {
      return;
    }
    mutateAsync({ files });
  }, [mutateAsync]);

  const artifactsElement = useMemo(() => {
    if (
      artifactsVisibility === true &&
      currentArtifactId != null &&
      Object.keys(artifacts ?? {}).length > 0
    ) {
      return (
        <ArtifactsProvider>
          <EditorProvider>
            <Suspense fallback={null}>
              <Artifacts />
            </Suspense>
          </EditorProvider>
        </ArtifactsProvider>
      );
    }
    return null;
  }, [artifactsVisibility, artifacts, currentArtifactId]);

  return (
    <DragDropWrapper className="relative flex w-full grow overflow-hidden bg-presentation">
      <SidePanelGroup artifacts={artifactsElement}>
        <main className="flex h-full flex-col overflow-y-auto" role="main">
          {children}
        </main>
      </SidePanelGroup>
    </DragDropWrapper>
  );
}
