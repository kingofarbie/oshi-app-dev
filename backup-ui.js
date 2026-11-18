
/* =====================================================
   💾 推し活・全般データバックアップ
   backup-ui.js

   ・全般データをまとめてバックアップ
   ・ファイル名を自動設定
   ・保存前にファイル名を編集
   ・保存先選択に対応するブラウザでは保存先を選択
   ・非対応環境では通常ダウンロード

   ※有料会員データバックアップとは別機能
   ※既存の保存データは変更しない
===================================================== */

(function(){

"use strict";


/* =====================================================
   1. 日付から初期ファイル名を作成
===================================================== */

function createBackupFileName(){

    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `推し活_全般データ${year}${month}${day}.zip`;

}


/* =====================================================
   2. ファイル名を安全な形式にする
===================================================== */

function normalizeFileName(name){

    let fileName = String(name || "").trim();

    fileName = fileName.replace(/[\\/:*?"<>|]/g, "_");

    if(!fileName){
        throw new Error("ファイル名を入力してください。");
    }

    if(!fileName.toLowerCase().endsWith(".zip")){
        fileName += ".zip";
    }

    return fileName;

}


/* =====================================================
   3. 全般データを収集してZIPを作成
===================================================== */

async function createGeneralBackup(){

    if(!window.BackupManager){
        throw new Error("バックアップ機能が読み込まれていません。");
    }

    const manager = window.BackupManager;

    if(
        typeof manager.getSources !== "function" ||
        typeof manager.collectSelectedData !== "function" ||
        typeof manager.createZipBlob !== "function"
    ){
        throw new Error("バックアップ機能の準備ができていません。");
    }

    const sources = manager.getSources();

    const selectedIds = sources
        .map(source => source.id)
        .filter(id => typeof id === "string" && id.length > 0);

    if(selectedIds.length === 0){
        throw new Error("バックアップ対象がありません。");
    }

    const backupData =
        await manager.collectSelectedData(selectedIds);

    const zipBlob =
        await manager.createZipBlob(backupData);

    return zipBlob;

}


/* =====================================================
   4. 保存先を選択して保存
===================================================== */

async function saveBackupFile(blob, fileName){

    // ファイル保存先選択に対応するブラウザ
    if(typeof window.showSaveFilePicker === "function"){

        const handle = await window.showSaveFilePicker({

            suggestedName: fileName,

            types: [
                {
                    description: "推し活手帳バックアップ",
                    accept: {
                        "application/zip": [".zip"]
                    }
                }
            ]

        });

        const writable = await handle.createWritable();

        await writable.write(blob);

        await writable.close();

        return "picker";

    }

    // 非対応ブラウザでは通常ダウンロード
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download = fileName;

    document.body.appendChild(link);

    link.click();

    link.remove();

    setTimeout(function(){
        URL.revokeObjectURL(url);
    }, 60000);

    return "download";

}


/* =====================================================
   5. バックアップ実行
===================================================== */

window.saveAppBackup = async function(){

    const button =
        document.getElementById("saveAppBackupButton");

    const message =
        document.getElementById("saveAppBackupMessage");

    if(button){
        button.disabled = true;
        button.textContent = "⏳ バックアップ作成中...";
    }

    try{

        if(message){
            message.textContent =
                "データと写真・動画を集めています...";
        }

        // ZIPを作成
        const zipBlob = await createGeneralBackup();

        // 初期ファイル名を設定
        const defaultName = createBackupFileName();

        const inputName = window.prompt(
            "保存するファイル名を入力してください。",
            defaultName
        );

        // キャンセルされた場合
        if(inputName === null){

            if(message){
                message.textContent = "保存をキャンセルしました。";
            }

            return;

        }

        const fileName = normalizeFileName(inputName);

        if(message){
            message.textContent =
                "保存先を選択してください...";
        }

        const saveType =
            await saveBackupFile(zipBlob, fileName);

        if(message){

            message.textContent =
                saveType === "picker"
                ? "保存処理が完了しました。"
                : "ダウンロードを開始しました。保存先を確認してください。";

        }

        alert(
            "全般データバックアップの保存処理が完了しました。\n\n" +
            "ファイル名：\n" + fileName
        );

    }catch(error){

        if(error.name === "AbortError"){

            if(message){
                message.textContent = "保存をキャンセルしました。";
            }

            return;

        }

        console.error("バックアップ保存エラー:", error);

        if(message){
            message.textContent =
                "バックアップに失敗しました：" + error.message;
        }

        alert(
            "バックアップに失敗しました。\n\n" +
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
