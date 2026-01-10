require('dotenv').config();
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CONFIG = {
    BASE_DIR: '/Users/matahideimamichi/Desktop/app/gemini-cli'
};

async function main() {
    const projectName = process.argv[2];
    if (!projectName) {
        console.error('⚠️ Usage: node vibes_oneshot.js "Project Name"');
        process.exit(1);
    }

    console.log(`\n🚀 Vibes One-Shot Trigger for: "${projectName}"\n`);

    try {
        // 1. まず設計 (GAS上のステータスが「承認」なら設計書を作る)
        // もし既に設計済みでも、上書き更新するか、あるいは既存を使うかは vibes_designer 次第だが
        // ここでは「設計書がないなら作る」という動きを期待して designer を呼ぶ
        console.log('--- Step 1: Designing ---');
        try {
            execSync('node vibes_designer.js', { stdio: 'inherit' });
        } catch (e) {
            console.log('Designer step finished (possibly skipped or error). Continuing...');
        }

        // 2. 同期 (GAS情報をもとにローカルディレクトリを準備)
        console.log('\n--- Step 2: Syncing ---');
        execSync('node vibes_coder.js', { stdio: 'inherit' });

        // 3. 実装 (コード生成 & ビルド)
        console.log(`\n--- Step 3: Building "${projectName}" ---`);
        execSync(`node vibes_builder.js "${projectName}"`, { stdio: 'inherit' });

        // 4. プレビュー起動
        console.log(`\n--- Step 4: Previewing "${projectName}" ---`);
        // プレビューは常駐プロセスになるため、別窓で開くか、ここで実行し続けるか。
        // One-shot なので、ここで実行し続けてユーザーに見せる形にする。
        execSync(`node vibes_preview.js "${projectName}"`, { stdio: 'inherit' });

    } catch (error) {
        console.error('\n❌ One-Shot Error:', error.message);
    }
}

main();
