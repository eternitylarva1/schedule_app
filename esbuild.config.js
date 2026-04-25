/**
 * esbuild configuration for independent module bundling
 * 
 * Strategy: Bundle each module independently so they can be loaded
 * separately via script tags in HTML.
 */

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'frontend', 'static', 'js');
const outDir = path.join(__dirname, 'frontend', 'static', 'js', 'dist');

// Ensure output directory exists
if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
}

// Modules to bundle independently
const modules = [
    { name: 'budget', file: 'budget.js' },
    { name: 'notepad', file: 'notepad.js' },
    { name: 'goals', file: 'goals.js' },
    { name: 'settings', file: 'settings.js' },
    { name: 'utils2', file: 'utils2.js' },
    { name: 'main', file: 'main.js' },
];

async function build() {
    console.log('🎯 esbuild - Independent Module Bundling\n');
    console.log('='.repeat(50));

    for (const mod of modules) {
        const entry = path.join(srcDir, mod.file);
        
        if (!fs.existsSync(entry)) {
            console.log(`⚠️  ${mod.file} not found, skipping`);
            continue;
        }

        const outFile = path.join(outDir, mod.file);

        try {
            await esbuild.build({
                entryPoints: [entry],
                bundle: true,
                outfile: outFile,
                format: 'iife',
                minify: false,
                sourcemap: true,
                target: ['es2020'],
                logLevel: 'info',
            });

            const size = fs.statSync(outFile).size;
            const originalSize = fs.statSync(entry).size;
            const change = ((size - originalSize) / originalSize * 100).toFixed(1);
            const changeStr = size < originalSize ? `${change}% smaller` : size > originalSize ? `${change}% larger` : 'same';
            
            console.log(`✅ ${mod.file.padEnd(15)} → ${(size / 1024).toFixed(2)} KB (${changeStr})`);

        } catch (error) {
            console.error(`❌ ${mod.file} failed:`, error.message);
        }
    }

    console.log('='.repeat(50));
    console.log('\n📊 Summary:');
    
    // List all generated files with sizes
    const files = fs.readdirSync(outDir).filter(f => f.endsWith('.js') && !f.endsWith('.map'));
    let totalSize = 0;
    files.forEach(f => {
        const size = fs.statSync(path.join(outDir, f)).size;
        totalSize += size;
        console.log(`  ${f.padEnd(20)} ${(size / 1024).toFixed(2)} KB`);
    });
    console.log(`  ${'-'.repeat(35)}`);
    console.log(`  ${'Total'.padEnd(20)} ${(totalSize / 1024).toFixed(2)} KB`);

    console.log('\n✨ Build completed!');
    console.log(`📁 Output: ${outDir}`);
}

build().catch(console.error);
