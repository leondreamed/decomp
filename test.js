import fs from "fs";
import isJpg from "is-jpg";
import { pathExists } from "path-exists";
import { rimraf } from "rimraf";
import test from "ava";
import m from "./index.js";
import { join, dirname } from "desm";

test.serial.afterEach(
  "ensure decompressed files and directories are cleaned up",
  async () => {
    await rimraf(join(import.meta.url, "directory"));
    await rimraf(join(import.meta.url, "dist"));
    await rimraf(join(import.meta.url, "example.txt"));
    await rimraf(join(import.meta.url, "file.txt"));
    await rimraf(join(import.meta.url, "edge_case_dots"));
    await rimraf(join(import.meta.url, "symlink"));
    await rimraf(join(import.meta.url, "test.jpg"));
  }
);

test("extract file", async (t) => {
  const tarFiles = await m(join(import.meta.url, "fixtures", "file.tar"));
  const tarbzFiles = await m(join(import.meta.url, "fixtures", "file.tar.bz2"));
  const targzFiles = await m(join(import.meta.url, "fixtures", "file.tar.gz"));
  const zipFiles = await m(join(import.meta.url, "fixtures", "file.zip"));

  t.is(tarFiles[0].path, "test.jpg");
  t.true(isJpg(tarFiles[0].data));
  t.is(tarbzFiles[0].path, "test.jpg");
  t.true(isJpg(tarbzFiles[0].data));
  t.is(targzFiles[0].path, "test.jpg");
  t.true(isJpg(targzFiles[0].data));
  t.is(zipFiles[0].path, "test.jpg");
  t.true(isJpg(zipFiles[0].data));
});

test("extract file using buffer", async (t) => {
  const tarBuf = await fs.promises.readFile(
    join(import.meta.url, "fixtures", "file.tar")
  );
  const tarFiles = await m(tarBuf);
  const tarbzBuf = await fs.promises.readFile(
    join(import.meta.url, "fixtures", "file.tar.bz2")
  );
  const tarbzFiles = await m(tarbzBuf);
  const targzBuf = await fs.promises.readFile(
    join(import.meta.url, "fixtures", "file.tar.gz")
  );
  const targzFiles = await m(targzBuf);
  const zipBuf = await fs.promises.readFile(
    join(import.meta.url, "fixtures", "file.zip")
  );
  const zipFiles = await m(zipBuf);

  t.is(tarFiles[0].path, "test.jpg");
  t.is(tarbzFiles[0].path, "test.jpg");
  t.is(targzFiles[0].path, "test.jpg");
  t.is(zipFiles[0].path, "test.jpg");
});

test.serial("extract file to directory", async (t) => {
  const files = await m(
    join(import.meta.url, "fixtures", "file.tar"),
    dirname(import.meta.url)
  );

  t.is(files[0].path, "test.jpg");
  t.true(isJpg(files[0].data));
  t.true(await pathExists(join(import.meta.url, "test.jpg")));
});

test.serial("extract symlink", async (t) => {
  await m(
    join(import.meta.url, "fixtures", "symlink.tar"),
    dirname(import.meta.url),
    {
      strip: 1,
    }
  );
  t.is(
    await fs.promises.realpath(join(import.meta.url, "symlink")),
    join(import.meta.url, "file.txt")
  );
});

test.serial("extract directory", async (t) => {
  await m(
    join(import.meta.url, "fixtures", "directory.tar"),
    dirname(import.meta.url)
  );
  t.true(await pathExists(join(import.meta.url, "directory")));
});

test("strip option", async (t) => {
  const zipFiles = await m(join(import.meta.url, "fixtures", "strip.zip"), {
    strip: 1,
  });
  const tarFiles = await m(join(import.meta.url, "fixtures", "strip.tar"), {
    strip: 1,
  });

  t.is(zipFiles[0].path, "test-strip.jpg");
  t.true(isJpg(zipFiles[0].data));
  t.is(tarFiles[0].path, "test-strip.jpg");
  t.true(isJpg(tarFiles[0].data));
});

test("filter option", async (t) => {
  const files = await m(join(import.meta.url, "fixtures", "file.tar"), {
    filter: (x) => x.path !== "test.jpg",
  });

  t.is(files.length, 0);
});

test("map option", async (t) => {
  const files = await m(join(import.meta.url, "fixtures", "file.tar"), {
    map: (x) => {
      x.path = `unicorn-${x.path}`;
      return x;
    },
  });

  t.is(files[0].path, "unicorn-test.jpg");
});

test.serial("set mtime", async (t) => {
  const files = await m(
    join(import.meta.url, "fixtures", "file.tar"),
    dirname(import.meta.url)
  );
  const stat = await fs.promises.stat(join(import.meta.url, "test.jpg"));
  t.deepEqual(files[0].mtime, stat.mtime);
});

test("return emptpy array if no plugins are set", async (t) => {
  const files = await m(join(import.meta.url, "fixtures", "file.tar"), {
    plugins: [],
  });
  t.is(files.length, 0);
});

test.serial("throw when a location outside the root is given", async (t) => {
  await t.throwsAsync(
    async () => {
      await m(join(import.meta.url, "fixtures", "slipping.tar.gz"), "dist");
    },
    { message: /Refusing/ }
  );
});

test.serial(
  "throw when a location outside the root including symlinks is given",
  async (t) => {
    await t.throwsAsync(
      async () => {
        await m(join(import.meta.url, "fixtures", "slip.zip"), "dist");
      },
      { message: /Refusing/ }
    );
  }
);

test.serial(
  "throw when a top-level symlink outside the root is given",
  async (t) => {
    await t.throwsAsync(
      async () => {
        await m(join(import.meta.url, "fixtures", "slip2.zip"), "dist");
      },
      { message: /Refusing/ }
    );
  }
);

test.serial(
  "throw when a directory outside the root including symlinks is given",
  async (t) => {
    await t.throwsAsync(
      async () => {
        await m(
          join(import.meta.url, "fixtures", "slipping_directory.tar.gz"),
          "dist"
        );
      },
      { message: /Refusing/ }
    );
  }
);

test.serial(
  "allows filenames and directories to be written with dots in their names",
  async (t) => {
    const files = await m(
      join(import.meta.url, "fixtures", "edge_case_dots.tar.gz"),
      dirname(import.meta.url)
    );
    t.is(files.length, 6);
    t.deepEqual(
      files.map((f) => f.path).sort(),
      [
        "edge_case_dots/",
        "edge_case_dots/internal_dots..txt",
        "edge_case_dots/sample../",
        "edge_case_dots/ending_dots..",
        "edge_case_dots/x",
        "edge_case_dots/sample../test.txt",
      ].sort()
    );
  }
);

test.serial("allows top-level file", async (t) => {
  const files = await m(
    join(import.meta.url, "fixtures", "top_level_example.tar.gz"),
    "dist"
  );
  t.is(files.length, 1);
  t.is(files[0].path, "example.txt");
});

test.serial(
  "throw when chained symlinks to /tmp/dist allow escape outside root directory",
  async (t) => {
    await t.throwsAsync(
      async () => {
        await m(join(import.meta.url, "fixtures", "slip3.zip"), "/tmp/dist");
      },
      { message: /Refusing/ }
    );
  }
);
