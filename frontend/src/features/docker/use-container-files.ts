import { useCallback, useState } from 'react'
import {
  fetchContainerFiles,
  saveContainerFiles,
  type ContainerFilePaths,
  type ContainerFileSet,
  type DockerContainer,
  type FileKind,
} from '@/features/docker/docker-api'

export type ContainerFiles = ReturnType<typeof useContainerFiles>

type LoadedFiles = {
  paths: ContainerFilePaths
  files: ContainerFileSet
}

export function useContainerFiles() {
  const [loaded, setLoaded] = useState<Record<string, LoadedFiles>>({})
  const [drafts, setDrafts] = useState<Record<string, ContainerFileSet>>({})
  const [resets, setResets] = useState(0)

  const load = useCallback(async (container: DockerContainer) => {
    const result = await fetchContainerFiles(container.id)
    if (result) {
      setLoaded((current) => ({ ...current, [container.id]: result }))
    }
    return result !== null
  }, [])

  const pathsOf = (container: DockerContainer) => loaded[container.id]?.paths ?? null
  const savedOf = (container: DockerContainer) => loaded[container.id]?.files ?? null
  const draftOf = (container: DockerContainer) => drafts[container.id] ?? savedOf(container)

  const edit = (container: DockerContainer, kind: FileKind, value: string) => {
    setDrafts((current) => {
      const base = current[container.id] ?? loaded[container.id].files
      return { ...current, [container.id]: { ...base, [kind]: value } }
    })
  }

  const discard = (container: DockerContainer) => {
    setDrafts(({ [container.id]: _discarded, ...rest }) => rest)
    setResets((value) => value + 1)
  }

  const save = async (container: DockerContainer) => {
    const draft = draftOf(container)
    if (draft === null) {
      return
    }
    await saveContainerFiles(container.id, draft)
    setLoaded((current) => ({ ...current, [container.id]: { ...current[container.id], files: draft } }))
    setDrafts(({ [container.id]: _saved, ...rest }) => rest)
  }

  return { load, pathsOf, savedOf, draftOf, edit, discard, save, resets }
}
