```markdown
# アプリケーション詳細設計書 - シンプルじゃんけん (SPEC.md)

## 1. Overview

### アプリ名
シンプルじゃんけん

### 概要
誰でも手軽に遊べる、昔ながらのシンプルなじゃんけんアプリです。ユーザーはAIとじゃんけんを行い、勝敗数を競います。余計な要素を排除し、じゃんけん本来の楽しさを追求します。

### 主要機能
*   **じゃんけん対戦機能**: ユーザーが「グー」「チョキ」「パー」を選択し、AIとのじゃんけんを行います。
*   **勝敗数記録・表示**: 対戦ごとの結果（勝ち、負け、引き分け）を記録し、累計の勝敗数をホーム画面に表示します。
*   **広告表示機能**: アプリ内にバナー広告や動画広告を表示し、収益化を図ります。
*   **(検討)** **広告なし有料版**: 広告を非表示にする有料版の提供を検討します。

### ターゲット
老若男女問わず、手軽に暇つぶしをしたい方、シンプルなゲームを楽しみたい方、思考なしに楽しめるカジュアルゲームを探している方。

## 2. Architecture

本アプリケーションでは、以下のアーキテクチャパターンを採用し、保守性、拡張性、テスト容易性を高めます。

*   **状態管理**: Riverpod
*   **ルーティング**: GoRouter
*   **アーキテクチャパターン**: MVVM (Model-View-ViewModel) with Repository Pattern

### 各層の役割

*   **View (Presentation Layer)**:
    *   ユーザーインターフェース（UI）の描画を担当します。
    *   ユーザーからの入力イベント（ボタンタップなど）をViewModelに通知します。
    *   ViewModelから提供される状態を監視し、UIを更新します。
    *   Widgetとして実装されます。
*   **ViewModel (Presentation Layer)**:
    *   Viewの状態（UIに表示されるデータやUIの状態）を管理します。
    *   Viewからのイベントを受け取り、ビジネスロジックを実行するためにUseCaseを呼び出します。
    *   UseCaseの結果をViewが監視できる形で提供します（RiverpodのProviderを使用）。
    *   FlutterのライフサイクルやWidgetの依存関係から独立しています。
*   **UseCase (Domain Layer)**:
    *   特定のビジネスロジックをカプセル化します。
    *   Repositoryインターフェースを介してデータにアクセスします。
    *   アプリケーション固有のルールやフローを定義します。
*   **Repository (Domain Layer)**:
    *   データソースへのアクセスを抽象化するインターフェースを定義します。
    *   Domain層はRepositoryインターフェースにのみ依存し、具体的なデータソースの実装には依存しません。
*   **Repository Implementation (Data Layer)**:
    *   Repositoryインターフェースの具体的な実装を提供します。
    *   複数のデータソース（例: ローカルストレージ、リモートAPI）を統合する役割を担います。
*   **Data Source (Data Layer)**:
    *   特定のデータストレージ（例: `shared_preferences`、APIクライアント）に対する直接的なデータ操作（CRUD）をカプセル化します。

## 3. Directory Structure

`lib/` 以下の推奨フォルダ構成は以下の通りです。

```
lib/
├───main.dart                  # アプリケーションのエントリーポイント
├───config/                    # アプリケーション全体の定数、テーマ定義など
│   ├───app_constants.dart     # アプリケーションで使用する定数
│   └───app_theme.dart         # アプリケーションのテーマ（Cupertino/Material 3）
├───data/
│   ├───data_sources/          # データソースの実装
│   │   └───game_local_data_source.dart # ローカルストレージ（shared_preferences）を使ったデータアクセス
│   └───repositories/          # リポジトリの具体的な実装
│       └───game_repository_impl.dart # GameRepositoryインターフェースの実装
├───domain/
│   ├───entities/              # ドメイン固有のエンティティ（データモデル）
│   │   └───game_stats.dart    # じゃんけんの勝敗統計データモデル
│   ├───repositories/          # リポジトリインターフェースの定義
│   │   └───game_repository.dart # じゃんけん統計データの取得・保存インターフェース
│   └───usecases/              # ビジネスロジックをカプセル化したユースケース
│       ├───get_game_stats_usecase.dart   # 勝敗統計を取得するユースケース
│       ├───play_game_usecase.dart        # じゃんけんプレイロジックと結果記録ユースケース
│       └───reset_game_stats_usecase.dart # 勝敗統計をリセットするユースケース
├───presentation/
│   ├───pages/                 # 各画面のWidget
│   │   ├───home_page.dart     # ホーム画面（じゃんけん選択、勝敗表示）
│   │   ├───result_page.dart   # 結果表示画面（じゃんけんの結果、次へ）
│   │   └───settings_page.dart # 設定画面（統計リセット、広告関連）
│   ├───view_models/           # Riverpod Providerとして提供されるViewModel
│   │   ├───home_view_model.dart     # ホーム画面用ViewModel
│   │   ├───result_view_model.dart   # 結果画面用ViewModel
│   │   └───settings_view_model.dart # 設定画面用ViewModel
│   ├───widgets/               # アプリケーション全体で再利用される共通Widget
│   │   └───ad_banner_widget.dart # バナー広告表示用Widget
│   └───routes/                # GoRouterのルーティング設定
│       └───app_router.dart    # GoRouterの設定とルート定義
├───utils/                     # 汎用的なヘルパー関数、拡張機能など
│   ├───app_logger.dart        # ロギングユーティリティ
│   └───hand_extension.dart    # じゃんけんの手のEnum拡張
```

## 4. Data Models

### `domain/entities/game_stats.dart`

```dart
// じゃんけんの手
enum Hand {
  rock,    // グー
  scissors, // チョキ
  paper    // パー
}

// じゃんけんの結果
enum GameOutcome {
  win,     // 勝ち
  lose,    // 負け
  draw     // 引き分け
}

// ゲームの統計データを表すエンティティ
class GameStats {
  final int totalGames; // 総対戦数
  final int wins;       // 勝利数
  final int losses;     // 敗北数
  final int draws;      // 引き分け数

  GameStats({
    required this.totalGames,
    required this.wins,
    required this.losses,
    required this.draws,
  });

  // 初期状態を生成するファクトリコンストラクタ
  factory GameStats.initial() => GameStats(totalGames: 0, wins: 0, losses: 0, draws: 0);

  // オブジェクトのコピーを作成し、一部プロパティを更新するメソッド
  GameStats copyWith({
    int? totalGames,
    int? wins,
    int? losses,
    int? draws,
  }) {
    return GameStats(
      totalGames: totalGames ?? this.totalGames,
      wins: wins ?? this.wins,
      losses: losses ?? this.losses,
      draws: draws ?? this.draws,
    );
  }

  // JSON形式に変換するメソッド (shared_preferences保存用)
  Map<String, dynamic> toJson() => {
        'totalGames': totalGames,
        'wins': wins,
        'losses': losses,
        'draws': draws,
      };

  // JSON形式からGameStatsオブジェクトを生成するファクトリコンストラクタ
  factory GameStats.fromJson(Map<String, dynamic> json) => GameStats(
        totalGames: json['totalGames'] as int,
        wins: json['wins'] as int,
        losses: json['losses'] as int,
        draws: json['draws'] as int,
      );

  @override
  String toString() {
    return 'GameStats(totalGames: $totalGames, wins: $wins, losses: $losses, draws: $draws)';
  }
}
```

## 5. UI/UX Flow

モダンでAppleらしいデザイン（Cupertino / Material 3）を意識し、シンプルさと直感的な操作性を追求します。基本的にはMaterial 3のデザインシステムを基盤としつつ、iOSのUXガイドラインに沿った調整を行います。

### 5.1. 画面遷移図

```mermaid
graph TD
    A[Splash Screen (起動時)] --> B(Home Page)
    B -- グー/チョキ/パー選択 --> C{じゃんけんロジック実行}
    C -- 結果表示 --> D(Result Dialog/Page)
    D -- 閉じる/次へ --> B
    B -- 設定アイコンタップ --> E(Settings Page)
    E -- 閉じる --> B
```

### 5.2. 各画面のUI要素

#### 5.2.1. Home Page (`presentation/pages/home_page.dart`)
*   **目的**: じゃけん対戦のメイン画面。勝敗統計の表示とじゃんけんの手の選択。
*   **UI要素**:
    *   **AppBar**:
        *   タイトル: 「シンプルじゃんけん」
        *   右側に設定アイコン（歯車マーク）を配置し、タップで設定画面へ遷移。
    *   **統計表示エリア**:
        *   現在の勝敗数（勝利、敗北、引き分け）を大きく、見やすく表示。
        *   例: 「WIN: 10 / LOSE: 5 / DRAW: 3」
    *   **じゃんけん手選択ボタン**:
        *   「グー」「チョキ」「パー」の3つのボタンを配置。
        *   各ボタンはアイコンとテキストを併記し、視覚的に分かりやすくする。
        *   ボタンはMaterial 3の`ElevatedButton`または`FilledButton`を基調とし、タップ時のフィードバックを明確にする。
    *   **バナー広告表示エリア**:
        *   画面下部にバナー広告を固定表示。
*   **デザイン考慮点**:
    *   Material 3のカラーパレットとタイポグラフィを適用し、モダンな印象を与える。
    *   CupertinoNavigationBarのような、クリーンで視認性の高いAppBarデザインを意識。
    *   ボタンはタップしやすい十分な大きさを確保し、余白を適切に配置する。

#### 5.2.2. Result Dialog/Page (`presentation/pages/result_page.dart`)
*   **目的**: 直前のじゃんけんの結果をユーザーに分かりやすく伝える。
*   **UI要素**:
    *   **タイトル**: 「結果」
    *   **ユーザーの手**: ユーザーが出した手をアイコンとテキストで表示。
    *   **AIの手**: AIが出した手をアイコンとテキストで表示。
    *   **勝敗結果**:
        *   「あなたの勝ち！」「あなたの負け...」「引き分け！」といったメッセージを大きく、結果に応じた色（例: 勝ち: 緑、負け: 赤、引き分け: 黄色）で表示。
        *   場合によってはアニメーションや効果音で視覚・聴覚的なフィードバックを与える。
    *   **閉じる/ホームに戻るボタン**:
        *   タップするとHome Pageに戻る。
*   **デザイン考慮点**:
    *   ダイアログ形式またはフルスクリーン遷移のどちらかを検討。シンプルさから言えばダイアログが望ましい。
    *   結果のメッセージを最上位に配置し、視線の誘導を考慮する。

#### 5.2.3. Settings Page (`presentation/pages/settings_page.dart`)
*   **目的**: アプリケーションの各種設定を行う。
*   **UI要素**:
    *   **AppBar**:
        *   タイトル: 「設定」
        *   左側に閉じるボタン（iOSの戻るボタンアイコン）
    *   **設定項目リスト**:
        *   `ListTile` を使用し、項目ごとに区切られたリスト表示。
        *   **統計リセット**:
            *   「勝敗記録をリセット」ボタン。タップ時に確認ダイアログを表示。
        *   **(検討)** **広告について**:
            *   「広告を非表示にする（有料）」ボタン。App Storeへのリンク。
        *   **情報**:
            *   「プライバシーポリシー」
            *   「利用規約」
            *   「バージョン情報」
*   **デザイン考慮点**:
    *   iOSの設定画面のような、シンプルで機能的なリストUIを採用。
    *   各項目は明確なラベルと、必要に応じてサブタイトルやアイコンを付与する。

## 6. Implementation Steps

Aiderに指示する際の実装順序の目安を以下に示します。

1.  **Flutterプロジェクトの初期設定と必要なパッケージの追加**:
    *   `riverpod`
    *   `go_router`
    *   `shared_preferences`
    *   `google_mobile_ads`
    *   `flutter_cupertino_icons` (Cupertinoデザイン要素が必要な場合)
    *   `intl` (日付フォーマットなどが必要な場合、今回は不要かもしれない)
2.  `lib/` ディレクトリ構造の作成。
3.  **Domain Layerの実装**:
    *   `domain/entities/game_stats.dart` の `Hand`, `GameOutcome`, `GameStats` クラスを定義。
    *   `domain/repositories/game_repository.dart` のリポジトリインターフェースを定義。
    *   `domain/usecases/` 以下のユースケースを定義（`GetGameStatsUseCase`, `PlayGameUseCase`, `ResetGameStatsUseCase`）。
4.  **Data Layerの実装**:
    *   `data/data_sources/game_local_data_source.dart` のローカルデータソース実装 (`shared_preferences` を利用)。`GameStats` の保存・取得ロジックを実装。
    *   `data/repositories/game_repository_impl.dart` のリポジトリ実装。`GameRepository` インターフェースを実装し、ローカルデータソースと連携。
5.  **Presentation Layer - ViewModelの実装**:
    *   `presentation/view_models/home_view_model.dart` を作成。じゃんけんロジック呼び出し、勝敗統計の管理、UI状態の提供を Riverpod の `Notifier` または `AsyncNotifier` で実装。
    *   `presentation/view_models/result_view_model.dart` を作成。じゃんけんの結果情報を保持し、Viewに提供。
    *   `presentation/view_models/settings_view_model.dart` を作成。勝敗統計のリセット機能などを提供。
6.  **Presentation Layer - UI (Widget) の実装**:
    *   `presentation/pages/home_page.dart` のホーム画面UIを実装。ViewModelから統計データを取得し表示、じゃんけんボタンからのイベントをViewModelに通知。
    *   `presentation/pages/result_page.dart` の結果画面UIを実装。ViewModelから結果データを取得し表示。
    *   `presentation/pages/settings_page.dart` の設定画面UIを実装。ViewModelからリセット機能などを呼び出し。
7.  **ルーティングの実装**:
    *   `presentation/routes/app_router.dart` を使用して GoRouter の設定とルート定義 (`/`, `/result`, `/settings`) を行う。
8.  **共通機能と設定**:
    *   `config/app_theme.dart` でアプリケーション全体のテーマ（Material 3とCupertinoの要素を組み合わせたテーマ）を定義。
    *   `utils/` 以下の汎用ユーティリティを必要に応じて実装。
9.  **広告の実装**:
    *   `google_mobile_ads` を設定し、`presentation/widgets/ad_banner_widget.dart` を作成してバナー広告をHome Pageに統合。
10. **テストコードの作成**:
    *   UseCase、Repository、ViewModel のユニットテストを作成し、ビジネスロジックの正しさを検証。
    *   Widgetテストやインテグレーションテストも検討。
11. **最適化と調整**:
    *   パフォーマンス最適化、UI/UXの微調整、アクセシビリティ対応。

---
```