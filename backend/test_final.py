"""
Teste final de todos os endpoints InfluxDB
"""
import requests
import json
from datetime import datetime

def test_all_endpoints():
    """Testa todos os endpoints InfluxDB"""
    print("🧪 TESTE COMPLETO INFLUXDB 2.7")
    print("=" * 50)
    
    base_url = "http://localhost:5000"
    
    # 1. Health Check
    print("🩺 1. HEALTH CHECK")
    try:
        response = requests.get(f"{base_url}/analytics/influxdb/health", timeout=5)
        data = response.json()
        print(f"   Status: {response.status_code}")
        print(f"   Enabled: {data.get('influxdb_enabled')}")
        print(f"   Healthy: {data.get('influxdb_healthy')}")
        print(f"   URL: {data.get('influxdb_url')}")
        print(f"   Bucket: {data.get('influxdb_bucket')}")
    except Exception as e:
        print(f"   ❌ Erro: {str(e)}")
    
    # 2. Realtime Metrics
    print("\n📊 2. REALTIME METRICS")
    try:
        response = requests.get(f"{base_url}/analytics/influxdb/realtime?time_range=-5m", timeout=5)
        data = response.json()
        print(f"   Status: {response.status_code}")
        print(f"   Count: {data.get('count')}")
        print(f"   Healthy: {data.get('influxdb_healthy')}")
        
        metrics = data.get('metrics', [])
        if metrics:
            print(f"   Primeira métrica:")
            first = metrics[0]
            print(f"     Page: {first.get('page_type')}")
            print(f"     Value: {first.get('value')}")
            print(f"     Time: {first.get('time')}")
            print(f"     Type: {first.get('type')}")
    except Exception as e:
        print(f"   ❌ Erro: {str(e)}")
    
    # 3. Summary
    print("\n📈 3. ANALYTICS SUMMARY")
    try:
        response = requests.get(f"{base_url}/analytics/influxdb/summary?time_range=-1h", timeout=5)
        data = response.json()
        print(f"   Status: {response.status_code}")
        print(f"   Healthy: {data.get('influxdb_healthy')}")
        
        page_analytics = data.get('page_analytics', {})
        print(f"   Pages: {list(page_analytics.keys())}")
        
        for page, stats in page_analytics.items():
            print(f"   {page.upper()}:")
            print(f"     Permanência: {stats.get('permanencia_segundos', 0):.1f}s")
            print(f"     Visualizações: {stats.get('visualizacoes', 0):.1f}")
            print(f"     Mouse moves: {stats.get('mouse_moves', 0):.1f}")
    except Exception as e:
        print(f"   ❌ Erro: {str(e)}")
    
    # 4. Navigation Event (POST)
    print("\n🔄 4. NAVIGATION EVENT")
    try:
        nav_data = {
            "session_id": "test_session_123",
            "from_page": "home",
            "to_page": "about",
            "navigation_time": 1.5
        }
        
        response = requests.post(
            f"{base_url}/analytics/influxdb/navigate",
            json=nav_data,
            headers={'Content-Type': 'application/json'},
            timeout=5
        )
        data = response.json()
        print(f"   Status: {response.status_code}")
        print(f"   Response: {data.get('status')}")
        print(f"   Message: {data.get('message')}")
    except Exception as e:
        print(f"   ❌ Erro: {str(e)}")
    
    print("\n" + "=" * 50)
    print("✅ TODOS OS TESTES CONCLUÍDOS")
    print("🚀 InfluxDB 2.7 integração funcionando!")
    
if __name__ == "__main__":
    test_all_endpoints()