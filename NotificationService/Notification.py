import sys
import os

def dispatcher(b2b,activator,st,cft,api,gateway,sentinel):
  send_notification(b2b,activator,st,cft,api,gateway,sentinel)

def send_notification(b2b, activator, st, cft, api, gateway, sentinel):
  message_parts = []

  if int(b2b) > 0: message_parts.append(f"{b2b} B2Bi Case(s)")
  if int(activator) > 0: message_parts.append(f"{activator} Activator Case(s)")
  if int(st) > 0: message_parts.append(f"{st} ST Case(s)")
  if int(cft) > 0: message_parts.append(f"{cft} CFT Case(s)")
  if int(api) > 0: message_parts.append(f"{api} API Case(s)")
  if int(gateway) > 0: message_parts.append(f"{gateway} Gateway Case(s)")
  if int(sentinel) > 0: message_parts.append(f"{sentinel} Sentinel Case(s)")

  message = "\n".join(message_parts)
  
  if message:
    script = f'display notification "{message}" with title "SalesForce Case Alert:" sound name "Funk"'
    os.system(f"osascript -e '{script}'")

if __name__ == "__main__":
  if len(sys.argv) != 8:
    sys.exit(1)

  b2b_count = sys.argv[1]
  activator_count = sys.argv[2]
  st_count = sys.argv[3]
  cft_count = sys.argv[4]
  api_count = sys.argv[5]
  gateway_count = sys.argv[6]
  sentinel_count = sys.argv[7]
  dispatcher(b2b_count, activator_count, st_count, cft_count, api_count, gateway_count, sentinel_count)
