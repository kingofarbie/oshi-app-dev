
/* =========================================================
   推し活手帳
   バックアップ復元 UI
   ZIP選択・内容検査
   ※現段階ではデータの復元・変更は行わない
========================================================= */

(function(){

    let selectedBackupFile = null;
    let inspectedBackupData = null;


    /* =====================
       メッセージ表示
    ===================== */

    function showMessage(message, isError = false){

        const element =
            document.getElementById("restoreBackupMessage");

        if(!element) return;

        element.textContent = message;
        element.style.color =
            isError ? "#d33" : "";

    }


    /* =====================
       検査結果表示
    ===================== */

    function showInspectionResult(report){

        const container =
            document.getElementById(
                "restoreBackupInspection"
            );

        const result =
            document.getElementById(
                "restoreBackupInspectionResult"
            );

        if(!container || !result){

            throw new Error(
                "検査結果の表示欄が見つかりません。"
            );

        }

        const lines = [

            "ZIPファイルの検査に成功しました。",
            "",
            "ファイル名：" + report.filename,
            "作成日時：" + report.createdAt,
            "",
            "メインデータ：" +
                report.mainDataItems.length + "項目",

            "その他の保存データ：" +
                report.localStorageItems.length + "項目",

            "写真・動画：" +
                report.mediaCount + "件",

            "メディア容量：" +
                (
                    report.mediaSize /
                    1024 /
                    1024
                ).toFixed(2) + " MB",

            "",
            "ZIP内ファイル数：" +
                report.zipEntryCount,

            "CRC検証済み：" +
                report.checkedCRCCount + "件",

            "",
            "※まだ復元は実行されていません。"

        ];

        result.textContent = lines.join("\n");

        container.style.display = "block";

    }


    /* =====================
       ファイル選択後の処理
    ===================== */

    async function handleBackupFileChange(event){

        const input = event.target;

        const file =
            input.files && input.files[0];

        if(!file) return;

        selectedBackupFile = file;
        inspectedBackupData = null;

        console.log(
            "バックアップZIP選択:",
            file.name,
            file.size
        );

        const nameElement =
            document.getElementById(
                "restoreBackupFileName"
            );

        if(nameElement){
            nameElement.textContent = file.name;
        }

        const inspection =
            document.getElementById(
                "restoreBackupInspection"
            );

        if(inspection){
            inspection.style.display = "none";
        }

        const restoreButton =
            document.getElementById(
                "startRestoreBackupButton"
            );

        if(restoreButton){
            restoreButton.disabled = true;
        }

        showMessage("ZIPファイルを検査しています…");

        try{

            if(
                !window.BackupManager ||
                typeof BackupManager.inspectBackupFile !==
                    "function"
            ){

                throw new Error(
                    "バックアップ検査機能が読み込まれていません。"
                );

            }

            const inspected =
                await BackupManager.inspectBackupFile(file);

            if(
                !inspected ||
                !inspected.report ||
                !inspected.report.valid
            ){

                throw new Error(
                    "ZIPファイルの検査に失敗しました。"
                );

            }

            inspectedBackupData =
                inspected.backupData;

            showInspectionResult(inspected.report);

            if(restoreButton){
                restoreButton.disabled = false;
            }

            showMessage(
                "検査が完了しました。内容を確認してください。"
            );

            console.log(
                "バックアップZIP検査成功:",
                inspected.report
            );

        }catch(error){

            selectedBackupFile = null;
            inspectedBackupData = null;

            showMessage(
                "検査エラー：" + error.message,
                true
            );

            console.error(
                "バックアップZIP検査エラー:",
                error
            );

        }

    }


    /* =====================
       ZIPファイル選択ボタン
    ===================== */

    window.selectRestoreBackup = function(){

        const input =
            document.getElementById(
                "restoreBackupFile"
            );

        if(!input){

            showMessage(
                "復元用ファイル選択欄が見つかりません。",
                true
            );

            return;

        }

        input.value = "";
        input.click();

    };


    /* =====================
       復元ボタン
       ※まだ実際の復元は行わない
    ===================== */

    window.startRestoreBackup = function(){

        if(
            !selectedBackupFile ||
            !inspectedBackupData
        ){

            showMessage(
                "先にバックアップZIPを選択してください。",
                true
            );

            return;

        }

        showMessage(
            "ZIPの検査は完了しています。復元処理はまだ実装されていません。"
        );

    };


    /* =====================
       初期化
       settings.html 読み込み後に呼び出す
    ===================== */

    window.initRestoreBackupUI = function(){

        const input =
            document.getElementById(
                "restoreBackupFile"
            );

        if(!input){

            console.error(
                "復元用ファイル選択欄が見つかりません。"
            );

            return false;

        }

        /* 二重登録を防止 */
        if(input.dataset.restoreHandlerReady !== "true"){

            input.addEventListener(
                "change",
                handleBackupFileChange
            );

            input.dataset.restoreHandlerReady = "true";

        }

        selectedBackupFile = null;
        inspectedBackupData = null;

        input.value = "";

        const restoreButton =
            document.getElementById(
                "startRestoreBackupButton"
            );

        if(restoreButton){
            restoreButton.disabled = true;
        }

        const inspection =
            document.getElementById(
                "restoreBackupInspection"
            );

        if(inspection){
            inspection.style.display = "none";
        }

        showMessage("");

        console.log(
            "バックアップ復元UI初期化成功"
        );

        return true;

    };

})();
