import serial
import json
import os
from datetime import datetime

# ==========================================
# 여기를 내 Bluetooth COM 번호로 변경
# 예: COM7, COM8, COM11...
# ==========================================

PORT = os.getenv("ESP32_PORT", "COM4")

BAUD = 115200

FILE_NAME = os.getenv("ESP32_RESULTS_PATH", "sharehouse_results.json")


# ==========================================
# 기존 JSON 파일 불러오기
# ==========================================

if os.path.exists(FILE_NAME):
    try:
        with open(FILE_NAME, "r", encoding="utf-8") as f:
            results = json.load(f)

        if not isinstance(results, list):
            results = []

    except Exception:
        results = []

else:
    results = []


print("====================================")
print(" ShareHouse Bluetooth Receiver")
print("====================================")
print("Port :", PORT)
print("ESP32 데이터를 기다리는 중...")
print()


try:

    with serial.Serial(PORT, BAUD, timeout=1) as ser:

        print("Bluetooth COM 포트 열기 성공!")
        print("이제 ESP32의 종료 버튼을 눌러주세요.")
        print()

        while True:

            raw = ser.readline()

            if not raw:
                continue

            line = raw.decode(
                "utf-8",
                errors="ignore"
            ).strip()


            # 화면에도 수신 내용을 보여줌
            print("수신:", line)


            # JSON 데이터만 저장
            if not (
                line.startswith("{")
                and line.endswith("}")
            ):
                continue


            try:

                data = json.loads(line)

            except json.JSONDecodeError:

                print("JSON 형식이 아니어서 무시합니다.")
                continue


            # 저장 시각 추가
            data["saved_at"] = datetime.now().strftime(
                "%Y-%m-%d %H:%M:%S"
            )


            results.append(data)


            # JSON 파일 저장
            with open(
                FILE_NAME,
                "w",
                encoding="utf-8"
            ) as f:

                json.dump(
                    results,
                    f,
                    ensure_ascii=False,
                    indent=4
                )


            print()
            print("====================================")
            print("데이터 저장 완료!")
            print("Noise :", data.get("noise_count"))
            print("Clean :", data.get("clean_count"))
            print("Score :", data.get("score"))
            print("파일 :", FILE_NAME)
            print("====================================")
            print()


except serial.SerialException as e:

    print()
    print("COM 포트를 열지 못했습니다.")
    print(e)
    print()
    print("PORT의 COM 번호를 다른 Bluetooth COM 번호로 바꿔보세요.")
