# 詳細設計書: TaskBridge (SPEC.md)

## 1. Overview

**TaskBridge** は、macOSとiOSデバイス間でのタスク実行とワークフロー自動化をシームレスに実現するアプリケーションです。開発者、デザイナー、そして日常的に複数のデバイスを使いこなすパワーユーザーをターゲットとし、生産性の飛躍的な向上を目指します。

### 主要機能
-   **双方向タスク実行**: MacからiPhoneへ、またはiPhoneからMacへ、定義済みのタスク（アクション）をトリガーベースで実行します。
-   **多様なトリガー**: 手動実行、ファイルの変更、指定URLへのWebhook、スケジュール実行など、様々なトリガーを設定可能。
-   **豊富なアクション**: プッシュ通知、スクリプト実行、ファイル転送・プレビュー、クリップボード同期など、ユースケースに応じたアクションを提供。
-   **シンプルなUI**: 直感的な操作でタスクの作成・管理ができる、モダンでクリーンなUI。
-   **フリーミアムモデル**:
    -   **Free Plan**: 基本的なデバイス連携と月間10回までのタスク実行。
    -   **Pro Plan (サブスクリプション)**: 無制限のタスク実行、複数デバイス（3台以上）の連携、ショートカットアプリ連携などの高度な機能を提供。

## 2. Architecture

本アプリは、スケーラビリティとメンテナンス性を重視し、以下のアーキテクチャを採用します。

-   **状態管理**: **Riverpod**
    -   `riverpod_generator` を活用し、Providerの記述を簡潔に保ちます。
-   **画面遷移**: **GoRouter**
    -   宣言的なルーティングにより、複雑な画面遷移やディープリンクを管理します。
-   **設計パターン**: **MVVM (Model-View-ViewModel) + Repository Pattern**
    -   UI (View) とビジネスロジック (ViewModel) を明確に分離します。
    -   データアクセス層 (Repository) を抽象化することで、データソース（ローカルDB、API）の変更に柔軟に対応します。

```
┌──────────────────┐
│      View        │ (UI Widgets, e.g., CupertinoPage)
└─────────┬────────┘
          │ (User Interaction)
┌─────────V────────┐
│    ViewModel     │ (Riverpod Notifier)
└─────────┬────────┘
          │ (Calls UseCases)
┌─────────V────────┐
│      UseCase     │ (Business Logic)
└─────────┬────────┘
          │ (Depends on Repository Interface)
┌─────────V────────┐
│   Repository     │ (Abstract Interface)
└─────────┬────────┘
          │ (Implementation)
┌─────────V────────┐
│    DataSource    │ (Local / Remote)
└──────────────────┘
```

## 3. Directory Structure

`lib/` 以下のディレクトリ構成案です。機能ベースのフィーチャーファーストな構成とします。

```
lib/
├── main.dart                 # App Entry Point
│
├── core/                     # アプリ全体で共有されるコア機能
│   ├── providers/            # Riverpod Providerの定義
│   ├── services/             # 外部サービス (P2P, API Client)
│   ├── errors/               # カスタム例外・エラー
│   ├── constants/            # 定数
│   └── utils/                # 汎用ヘルパー関数
│
├── data/                     # データ層 (実装)
│   ├── datasources/
│   │   ├── local/            # Local DB, SharedPreferences
│   │   └── remote/           # Firebase/Firestore Client
│   ├── models/               # DTO (Data Transfer Objects)
│   └── repositories/         # Repositoryの実装クラス
│
├── domain/                   # ドメイン層 (抽象)
│   ├── entities/             # ビジネスオブジェクト (Freezed)
│   ├── repositories/         # Repositoryのインターフェース
│   └── usecases/             # ビジネスロジック
│
└── presentation/             # UI/プレゼンテーション層
    ├── app_router.dart       # GoRouter Configuration
    ├── common_widgets/       # 共通UIコンポーネント
    │
    └── features/             # 機能ごとのディレクトリ
        ├── onboarding/
        │   ├── view/
        │   └── viewmodel/
        ├── task_list/
        │   ├── view/
        │   └── viewmodel/
        ├── task_editor/
        │   ├── view/
        │   └── viewmodel/
        ├── device_list/
        │   ├── view/
        │   └── viewmodel/
        ├── history/
        │   ├── view/
        │   └── viewmodel/
        └── settings/
            ├── view/
            └── viewmodel/
```

## 4. Data Models

`domain/entities` に `freezed` を用いて定義する主要なEntityクラスです。

```dart
// domain/entities/task.dart
@freezed
class Task with _$Task {
  const factory Task({
    required String id,
    required String name,
    String? description,
    required Trigger trigger,
    required Action action,
    required String sourceDeviceId, // トリガーを発行するデバイス
    required String targetDeviceId, // アクションを実行するデバイス
    required DateTime createdAt,
    @Default(true) bool isEnabled,
  }) = _Task;
}

// domain/entities/trigger.dart
@freezed
class Trigger with _$Trigger {
  const factory Trigger.manual() = _ManualTrigger; // 手動実行
  const factory Trigger.fileChange({required String path}) = _FileChangeTrigger; // ファイル変更
  const factory Trigger.webhook({required String path}) = _WebhookTrigger; // Webhook
  const factory Trigger.scheduled({required String cron}) = _ScheduledTrigger; // スケジュール実行
}

// domain/entities/action.dart
@freezed
class Action with _$Action {
  const factory Action.notification({required String title, String? body}) = _NotificationAction;
  const factory Action.runScript({required String script}) = _RunScriptAction;
  const factory Action.openFile({required String path}) = _OpenFileAction;
  const factory Action.syncClipboard() = _SyncClipboardAction;
}

// domain/entities/device.dart
@freezed
class Device with _$Device {
  const factory Device({
    required String id,
    required String name,
    required DeviceType type,
    required DeviceStatus status,
    required DateTime lastSeen,
  }) = _Device;
}

enum DeviceType { mac, iphone }
enum DeviceStatus { online, offline }

// domain/entities/user_profile.dart
@freezed
class UserProfile with _$UserProfile {
    const factory UserProfile({
        required String uid,
        String? email,
        required SubscriptionTier subscription,
    }) = _UserProfile;
}

enum SubscriptionTier { free, pro }
```

## 5. UI/UX Flow

モダンなAppleデザイン（Cupertino / Material 3のベストプラクティス）を意識し、クリーンで直感的なUIを目指します。

1.  **Onboarding (オンボーディング)**
    -   `CupertinoTabView` を用いたスワイプ可能な機能紹介画面。
    -   ローカルネットワークアクセス、通知などのパーミッションを要求。
    -   Firebase Authenticationによるサインイン/サインアップ機能。

2.  **Main Tab View (`CupertinoTabScaffold`)**
    -   **Devices (デバイス)**: 連携中のデバイス一覧。オンライン状態をリアルタイムに表示。
    -   **Tasks (タスク)**: 作成したタスクの一覧。`CupertinoListTile` と `CupertinoSwitch` で表示・操作。
    -   **History (履歴)**: タスクの実行ログ。成功/失敗をアイコンで表示。
    -   **Settings (設定)**: アカウント情報、サブスクリプション管理、通知設定など。

3.  **Device List Screen (デバイス一覧画面)**
    -   `CupertinoNavigationBar` にデバイス追加(`+`)ボタンを配置。
    -   Bonjour/mDNSを利用してローカルネットワーク内のデバイスを検出し、リスト表示。
    -   各デバイスをタップすると詳細画面へ遷移。

4.  **Task List Screen (タスク一覧画面)**
    -   タスクを `CupertinoListSection` 内にリスト表示。
    -   右上の `+` ボタンからタスク作成画面へ遷移。
    -   各タスクをスワイプして編集・削除アクションを表示。

5.  **Task Editor Screen (タスク作成/編集画面)**
    -   `CupertinoFormSection` を使用した設定フォーム。
    -   **Name**: タスク名 (`CupertinoTextField`)
    -   **Trigger**: トリガー種別を選択する `CupertinoPicker` またはモーダル。選択内容に応じて詳細設定（ファイルパスなど）の入力欄を表示。
    -   **Action**: アクション種別を選択する `CupertinoPicker` またはモーダル。同様に詳細設定を表示。
    -   **Target Device**: アクションを実行するデバイスを選択。

6.  **Settings Screen (設定画面)**
    -   `CupertinoListSection.insetGrouped` を使用した設定項目リスト。
    -   **Account**: ユーザー情報。
    -   **Upgrade to Pro**: サブスクリプション購入画面への導線。`RevenueCat` または `in_app_purchase` を利用。
    -   **Sign Out**: ログアウト機能。

## 6. Implementation Steps

Aiderへの指示を想定した開発のステップです。

1.  **Step 1: Project Setup & Foundation**
    -   `flutter create` と `pubspec.yaml` への依存パッケージ追加 (`flutter_riverpod`, `go_router`, `freezed`, `cupertino_icons` etc.)。
    -   上記 `Directory Structure` に基づくフォルダ群を作成。

2.  **Step 2: Data Models & Repository Interfaces**
    -   `freezed` を使い、`domain/entities` に `Task`, `Device` などのクラスを定義。
    -   `domain/repositories` に `TaskRepository`, `DeviceRepository` の抽象クラスを定義。

3.  **Step 3: Basic UI Shell & Routing**
    -   `app_router.dart` に `GoRouter` を設定し、主要画面 (`/devices`, `/tasks`, `/settings`) のルートを定義。
    -   `CupertinoTabScaffold` を用いたメインのUIシェルを構築。各タブに空の `View` を配置。

4.  **Step 4: Mock Data & ViewModel**
    -   `data/repositories` にモックデータを返すRepository実装クラスを作成。
    -   `Task List` 画面の `ViewModel` (Riverpod `Notifier`) を作成し、モックリポジトリからタスク一覧を取得してUIに表示するロジックを実装。

5.  **Step 5: Task Creation Feature**
    -   `Task Editor` 画面のUI (`CupertinoFormSection`) を実装。
    -   `ViewModel` を介して新しいタスクを作成し、一覧に反映させる機能を追加 (まだモック)。

6.  **Step 6: Core P2P Communication**
    -   `multicast_dns` や同様のパッケージを用いて、ローカルネットワーク内のデバイス発見機能を `core/services` に実装。
    -   `Device List` 画面で発見したデバイスを表示。

7.  **Step 7: Backend & Persistence**
    -   Firebaseプロジェクトをセットアップ。
    -   `firebase_auth` を用いた認証機能を実装。
    -   `cloud_firestore` を使用し、Repositoryの実装をモックからFirestoreバックエンドに置き換え。タスクとデバイス情報を永続化する。

8.  **Step 8: Subscription Feature**
    -   `RevenueCat` or `in_app_purchase` を導入し、Pro版へのアップグレード機能を `Settings` 画面に実装。
    -   `Riverpod` Providerでユーザーの購読状態を管理し、機能制限を適用。

9.  **Step 9: Feature Refinement & Testing**
    -   トリガーとアクションの種類を拡充。
    -   `History` 画面を実装。
    -   WidgetテストとUnitテストを作成し、コードの品質を担保。

10. **Step 10: Polishing**
    -   UIアニメーションの追加、フィードバックの改善など、全体的なUXを向上させる。