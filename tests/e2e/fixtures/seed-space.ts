export interface SeedFile {
  path: string;
  content: string;
}

export function seedSpace(): SeedFile[] {
  return [
    { path: "abc.md", content: "# abc" },
    { path: "def.md", content: "# def" },
    { path: "ghk.md", content: "# ghk" }
  ];
}
