#!/bin/zsh
source ~/.zshrc
export PATH=$PATH:/opt/homebrew/bin:/usr/local/bin
cd "$(dirname "$0")"
echo "🚀 Starting Aider for TaskBridge (タスクブリッジ)..."
echo "Waiting for 3 seconds..."
sleep 3
# Geminiモデルを指定して起動
aider --architect --model gemini/gemini-1.5-pro-latest
