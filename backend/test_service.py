"""
Teste do serviço InfluxDB específico
"""
import sys
import os
sys.path.append(os.path.dirname(__file__))

from influxdb_service import get_influxdb_service

def test_influxdb_service():
    """Testa o serviço InfluxDB especificamente"""
    print("🔍 TESTE DO SERVIÇO INFLUXDB")
    print("=" * 50)
    
    # Obter serviço
    service = get_influxdb_service()
    
    print(f"🔧 Serviço InfluxDB:")
    print(f"   Enabled: {service.enabled}")
    print(f"   URL: {service.url}")
    print(f"   Bucket: {service.bucket}")
    print(f"   Org: {service.org}")
    
    # 1. Teste de saúde
    print("\n🩺 Teste de saúde:")
    health = service.is_healthy()
    print(f"   Health: {health}")
    
    # 2. Teste de consulta realtime (o que está falhando)
    print("\n📊 Teste query_realtime_metrics (-5m):")
    try:
        metrics = service.query_realtime_metrics("-5m")
        print(f"   ✅ Sucesso: {len(metrics)} métricas encontradas")
        
        for i, metric in enumerate(metrics[:3]):
            print(f"   Metric {i+1}: {metric}")
            
    except Exception as e:
        print(f"   ❌ Erro: {str(e)}")
        import traceback
        print(f"   Stack: {traceback.format_exc()}")
    
    # 3. Teste de consulta summary
    print("\n📈 Teste get_page_analytics_summary (-1h):")
    try:
        summary = service.get_page_analytics_summary("-1h")
        print(f"   ✅ Sucesso: {summary}")
        
    except Exception as e:
        print(f"   ❌ Erro: {str(e)}")
    
    print("\n" + "=" * 50)
    print("🎯 TESTE CONCLUÍDO")

if __name__ == "__main__":
    test_influxdb_service()