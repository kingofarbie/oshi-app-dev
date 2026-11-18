
/* =====================================================
   💾 推し活・全般データバックアップ
   backup-ui.js

   ・全般データをまとめて収集
   ・ZIPファイルを作成
   ・保存先を先に選択
   ・保存画面でファイル名を変更可能
   ・非対応ブラウザでは通常ダウンロード

   ※有料会員データとは別機能
   ※既存の保存データは変更しない
===================================================== */

(function(){

"use strict";


/* =====================================================
   1. 初期ファイル名
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

    const manager = window.BackupManager;

    if(!manager){
        throw new Error("バックアップ機能が読み込まれていません。");
    }

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
   4. 通常ダウンロード
===================================================== */

function downloadBackup(blob, fileName){

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
        button.textContent = "⏳ バックアップ準備中...";
    }

    try{

        let saveHandle = null;

        /*
         * 保存先選択画面を最初に開く。
         * ユーザーのボタン操作が有効なうちに呼び出す。
         */

        if(typeof window.showSaveFilePicker === "function"){

            const handlePromise =
                window.showSaveFilePicker({

                    suggestedName: createBackupFileName(),

                    types: [
                        {
                            description: "推し活手帳バックアップ",
                            accept: {
                                "application/zip": [".zip"]
                            }
                        }
                    ]

                });

            // ここで初めて待機する
            saveHandle = await handlePromise;

        }

        if(message){
            message.textContent =
                "データと写真・動画を集めています...";
        }

        // ZIPを作成
        const zipBlob = await createGeneralBackup();

        if(message){
            message.textContent = "ファイルを保存しています...";
        }

        if(saveHandle){

            // 選択した保存先へ書き込む
            const writable = await saveHandle.createWritable();

            await writable.write(zipBlob);

            await writable.close();

        }else{

            // 保存先選択に非対応の場合
            let fileName = window.prompt(
                "保存するファイル名を入力してください。",
                createBackupFileName()
            );

            if(fileName === null){
                if(message){
                    message.textContent = "保存をキャンセルしました。";
                }
                return;
            }

            fileName = normalizeFileName(fileName);

            downloadBackup(zipBlob, fileName);

        }

        if(message){
            message.textContent =
                "バックアップの保存処理が完了しました。";
        }

        alert(
            "推し活・全般データバックアップの保存処理が完了しました。"
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
