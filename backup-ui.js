
/* =====================================================
   💾 バックアップ保存画面
   backup-ui.js

   ・登録済みのバックアップ対象をすべて取得
   ・ZIPファイルを作成
   ・端末へのダウンロードを開始

   ※既存の保存データは変更しない
===================================================== */

(function(){

"use strict";


window.saveAppBackup = async function(){

    const button = document.getElementById("saveAppBackupButton");
    const message = document.getElementById("saveAppBackupMessage");

    if(!window.BackupManager){
        alert("バックアップ機能を読み込めませんでした。");
        return;
    }

    if(
        typeof BackupManager.getSources !== "function" ||
        typeof BackupManager.collectSelectedData !== "function" ||
        typeof BackupManager.exportZip !== "function"
    ){
        alert("バックアップ機能の準備ができていません。");
        return;
    }

    if(button){
        button.disabled = true;
        button.textContent = "⏳ バックアップ作成中...";
    }

    if(message){
        message.textContent =
            "データと写真・動画を集めています。しばらくお待ちください。";
    }

    try{

        // バックアップ対象をすべて取得
        const sources = BackupManager.getSources();

        if(!Array.isArray(sources) || sources.length === 0){
            throw new Error("バックアップ対象が見つかりません。");
        }

        const selectedIds = sources
            .map(source => source.id)
            .filter(id => typeof id === "string" && id.length > 0);

        if(selectedIds.length === 0){
            throw new Error("バックアップ対象のIDがありません。");
        }

        // データを収集
        const backupData =
            await BackupManager.collectSelectedData(selectedIds);

        // ZIPファイルを作成してダウンロード
        const result =
            await BackupManager.exportZip(backupData);

        if(message){
            message.textContent =
                "ZIPファイルの作成・ダウンロード処理が完了しました。ブラウザのダウンロードを確認してください。";
        }

        alert(
            "バックアップのダウンロード処理が完了しました。\n\n" +
            "スマホのダウンロード一覧にファイルがあるか確認してください。"
        );

        return result;

    }catch(error){

        console.error("バックアップ保存エラー:", error);

        if(message){
            message.textContent =
                "バックアップに失敗しました：" + error.message;
        }

        alert(
            "バックアップを作成できませんでした。\n\n" +
            error.message
        );

    }finally{

        if(button){
            button.disabled = false;
            button.textContent = "💾 バックアップを保存";
        }

    }

};

})();
