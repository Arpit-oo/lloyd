/** A file picked or dropped by the user, with its path inside the chosen folder ("Brand/images/logo.png"). */
export interface PickedFile {
  file: File;
  path: string;
}

/** Files from a drop, including everything inside dropped folders, with their paths. */
export async function droppedFiles(dt: DataTransfer): Promise<PickedFile[]> {
  const entries = [...dt.items].map((i) => i.webkitGetAsEntry()).filter((e): e is FileSystemEntry => !!e);
  if (!entries.some((e) => e.isDirectory)) return [...dt.files].map((file) => ({ file, path: file.name }));
  const out: PickedFile[] = [];
  const walk = async (e: FileSystemEntry): Promise<void> => {
    if (e.isFile) out.push({ file: await new Promise<File>((ok, err) => (e as FileSystemFileEntry).file(ok, err)), path: e.fullPath.replace(/^\//, "") });
    else if (e.isDirectory) {
      const reader = (e as FileSystemDirectoryEntry).createReader();
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((ok, err) => reader.readEntries(ok, err));
        if (!batch.length) break;
        await Promise.all(batch.map(walk));
      }
    }
  };
  await Promise.all(entries.map(walk));
  return out;
}

/** Files from an <input type="file" webkitdirectory>, with their paths. */
export const pickedFiles = (list: FileList | null): PickedFile[] => [...(list ?? [])].map((file) => ({ file, path: file.webkitRelativePath || file.name }));
