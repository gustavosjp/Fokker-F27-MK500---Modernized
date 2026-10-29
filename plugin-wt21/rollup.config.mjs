import resolve from '@rollup/plugin-node-resolve';

// The sim may read the script with a legacy charset, so every non-ASCII character (the degree sign) is written as a unicode escape.
const asciiOnly = {
  name: 'ascii-only',
  renderChunk: (code) => code.replace(/[^\x00-\x7f]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')),
};

// One IIFE for the MFD plugin. msfssdk / wt21_shared are the globals the WT21 instruments already load (Libraries\msfssdk.js and
// wt21shared.js), so they stay external. The CSS is embedded in the script (see F27Eis.tsx), so there is no separate .css to ship.
export default [
  {
    input: 'build/index.js',
    output: {
      file: 'dist/F27MfdPlugin.js',
      format: 'iife',
      name: 'f27Mfd',
      globals: {
        '@microsoft/msfs-sdk': 'msfssdk',
        '@microsoft/msfs-wt21-shared': 'wt21_shared',
      },
    },
    external: ['@microsoft/msfs-sdk', '@microsoft/msfs-wt21-shared'],
    plugins: [resolve(), asciiOnly],
  },
  // the F27 tablet instrument (tablet\F27Tablet.html loads Libraries\msfssdk.js, then this) and its browser preview (not shipped)
  ...[['build/tablet/index.js', 'dist/F27Tablet.js'], ['build/tablet/preview.js', 'dist/F27TabletPreview.js']].map(([input, file]) => ({
    input,
    output: { file, format: 'iife', name: 'f27Tablet', globals: { '@microsoft/msfs-sdk': 'msfssdk' } },
    external: ['@microsoft/msfs-sdk'],
    plugins: [resolve(), asciiOnly],
  })),
];
