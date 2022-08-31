import { readLines } from "https://deno.land/std@0.107.0/io/mod.ts";
import * as tty from "https://deno.land/x/tty@0.1.3/mod.ts";

const isatty = Deno.isatty(Deno.stdout.rid);

const list: { name: string; count: number; uniques: number }[] = [];
const print = () => {
  list.sort((l, r) => {
    const x = l.count - r.count;
    if (x !== 0) {
      return x;
    }
    return l.uniques - r.uniques;
  });
  console.table(list);
};
for await (const name of repos()) {
  const { count, uniques } = await views(name);
  list.push({ name, count, uniques });

  if (isatty) {
    await tty.clearScreen();
    await tty.goHome();
    print();
  }
}

if (!isatty) {
  print();
}

async function* repos(): AsyncGenerator<string, void, void> {
  const query = `query($endCursor: String) {
        viewer {
            repositories(first: 10, after: $endCursor) {
                nodes {
                  nameWithOwner
                  viewerCanUpdateTopics
                }
                pageInfo {
                    hasNextPage
                    endCursor
                }
            }
        }
    }`;

  const filter = ".data.viewer.repositories.nodes[]";

  const proc = Deno.run({
    cmd: [
      "gh",
      "api",
      "graphql",
      "--paginate",
      "-f",
      `query=${query}`,
      "--jq",
      filter,
    ],
    stdout: "piped",
  });

  function assertItem(
    data: unknown,
  ): asserts data is { nameWithOwner: string; viewerCanUpdateTopics: boolean } {
    const nameWithOwner = (data as Record<string, unknown>)["nameWithOwner"];
    const viewerCanUpdateTopics =
      (data as Record<string, unknown>)["viewerCanUpdateTopics"];
    if (
      typeof nameWithOwner !== "string" ||
      typeof viewerCanUpdateTopics !== "boolean"
    ) {
      throw new Error();
    }
  }

  for await (const line of readLines(proc.stdout)) {
    const data = JSON.parse(line);
    assertItem(data);
    const { nameWithOwner, viewerCanUpdateTopics } = data;
    if (!viewerCanUpdateTopics) {
      continue;
    }
    yield nameWithOwner;
  }
}

async function views(name: string): Promise<any> {
  const proc = Deno.run({
    cmd: ["gh", "api", `repos/${name}/traffic/views`],
    stdout: "piped",
  });
  const data = [];
  for await (const line of readLines(proc.stdout)) {
    data.push(line);
  }

  const status = await proc.status();
  if (!status.success) {
    throw new Error(data.join(""));
  }

  const c = JSON.parse(data.join(""));
  return c;
}
