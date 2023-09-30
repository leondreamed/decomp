import path from "node:path";
import fs from "graceful-fs";
import decompressTar from "decomp-tar";
import decompressTarbz2 from "decomp-tarbz2";
import decompressTargz from "decomp-targz";
import decompressUnzip from "decomp-unzip";
import makeDir from "make-dir";
import stripDirs from "strip-dirs";

const runPlugins = (input, opts) => {
  if (opts.plugins.length === 0) {
    return Promise.resolve([]);
  }

  return Promise.all(opts.plugins.map((x) => x(input, opts))).then((files) =>
    files.reduce((a, b) => a.concat(b))
  );
};

const safeMakeDir = (dir, realOutputPath) => {
  return fs.promises
    .realpath(dir)
    .catch((_) => {
      const parent = path.dirname(dir);
      return safeMakeDir(parent, realOutputPath);
    })
    .then((realParentPath) => {
      if (realParentPath.indexOf(realOutputPath) !== 0) {
        throw new Error(
          "Refusing to create a directory outside the output path."
        );
      }

      return makeDir(dir).then(fs.promises.realpath);
    });
};

const preventWritingThroughSymlink = (destination, realOutputPath) => {
  return fs.promises
    .readlink(destination)
    .catch((_) => {
      // Either no file exists, or it's not a symlink. In either case, this is
      // not an escape we need to worry about in this phase.
      return null;
    })
    .then((symlinkPointsTo) => {
      if (symlinkPointsTo) {
        throw new Error("Refusing to write into a symlink");
      }

      // No symlink exists at `destination`, so we can continue
      return realOutputPath;
    });
};

const extractFile = (input, output, opts) =>
  runPlugins(input, opts).then((files) => {
    if (opts.strip > 0) {
      files = files
        .map((x) => {
          x.path = stripDirs(x.path, opts.strip);
          return x;
        })
        .filter((x) => x.path !== ".");
    }

    if (typeof opts.filter === "function") {
      files = files.filter(opts.filter);
    }

    if (typeof opts.map === "function") {
      files = files.map(opts.map);
    }

    if (!output) {
      return files;
    }

    return Promise.all(
      files.map((x) => {
        const dest = path.join(output, x.path);
        const mode = x.mode & ~process.umask();
        const now = new Date();

        if (x.type === "directory") {
          return makeDir(output)
            .then((outputPath) => fs.promises.realpath(outputPath))
            .then((realOutputPath) => safeMakeDir(dest, realOutputPath))
            .then(() => fs.promises.utimes(dest, now, x.mtime))
            .then(() => x);
        }

        return makeDir(output)
          .then((outputPath) => fs.promises.realpath(outputPath))
          .then((realOutputPath) => {
            // Attempt to ensure parent directory exists (failing if it's outside the output dir)
            return safeMakeDir(path.dirname(dest), realOutputPath).then(
              () => realOutputPath
            );
          })
          .then((realOutputPath) => {
            if (x.type === "file") {
              return preventWritingThroughSymlink(dest, realOutputPath);
            }

            return realOutputPath;
          })
          .then((realOutputPath) => {
            return fs.promises
              .realpath(path.dirname(dest))
              .then((realDestinationDir) => {
                if (realDestinationDir.indexOf(realOutputPath) !== 0) {
                  throw new Error(
                    "Refusing to write outside output directory: " +
                      realDestinationDir
                  );
                }
              });
          })
          .then(() => {
            if (x.type === "link") {
              return fs.promises.link(x.linkname, dest);
            }

            if (x.type === "symlink" && process.platform === "win32") {
              return fs.promises.link(x.linkname, dest);
            }

            if (x.type === "symlink") {
              return fs.promises.symlink(x.linkname, dest);
            }

            return fs.promises.writeFile(dest, x.data, { mode });
          })
          .then(
            () => x.type === "file" && fs.promises.utimes(dest, now, x.mtime)
          )
          .then(() => x);
      })
    );
  });

export default (input, output, opts) => {
  if (typeof input !== "string" && !Buffer.isBuffer(input)) {
    return Promise.reject(new TypeError("Input file required"));
  }

  if (typeof output === "object") {
    opts = output;
    output = null;
  }

  opts = Object.assign(
    {
      plugins: [
        decompressTar(),
        decompressTarbz2(),
        decompressTargz(),
        decompressUnzip(),
      ],
    },
    opts
  );

  const read =
    typeof input === "string"
      ? fs.promises.readFile(input)
      : Promise.resolve(input);

  return read.then((buf) => extractFile(buf, output, opts));
};
