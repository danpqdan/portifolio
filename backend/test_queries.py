"""
Teste de consultas InfluxDB específicas
"""
import sys
import os
sys.path.append(os.path.dirname(__file__))

from influxdb_client import InfluxDBClient
from config import Config

def test_specific_queries():
    """Testa consultas específicas do InfluxDB"""
    print("🔍 TESTE DE CONSULTAS ESPECÍFICAS")
    print("=" * 50)
    
    url = Config.INFLUXDB_URL
    token = Config.INFLUXDB_TOKEN  
    org = Config.INFLUXDB_ORG
    bucket = Config.INFLUXDB_BUCKET
    
    try:
        with InfluxDBClient(url=url, token=token, org=org) as client:
            query_api = client.query_api()
            
            # 1. Consulta básica - só os últimos 5 minutos
            print("🔍 Consulta 1: Todos os dados dos últimos 5 minutos")
            query1 = f'''
            from(bucket: "{bucket}")
              |> range(start: -5m)
              |> limit(n: 5)
            '''
            
            try:
                result = query_api.query(query1)
                count = 0
                for table in result:
                    for record in table.records:
                        count += 1
                        print(f"   Record {count}: {record.get_measurement()}.{record.get_field()} = {record.get_value()}")
                        if count >= 3:
                            break
                    if count >= 3:
                        break
                        
                print(f"   ✅ Consulta 1 OK - {count} registros")
            except Exception as e:
                print(f"   ❌ Consulta 1 falhou: {str(e)}")
            
            # 2. Consulta page_analytics específica
            print("\n🔍 Consulta 2: Dados page_analytics")
            query2 = f'''
            from(bucket: "{bucket}")
              |> range(start: -24h)
              |> filter(fn: (r) => r._measurement == "page_analytics")
              |> limit(n: 3)
            '''
            
            try:
                result = query_api.query(query2)
                count = 0
                for table in result:
                    for record in table.records:
                        count += 1
                        print(f"   Page Analytics {count}:")
                        print(f"     Field: {record.get_field()}")
                        print(f"     Value: {record.get_value()}")
                        print(f"     Tags: {[k for k in record.values.keys() if not k.startswith('_')]}")
                        
                        if count >= 2:
                            break
                    if count >= 2:
                        break
                        
                print(f"   ✅ Consulta 2 OK - {count} registros page_analytics")
            except Exception as e:
                print(f"   ❌ Consulta 2 falhou: {str(e)}")
            
            # 3. Consulta com agregação (a que está falhando)
            print("\n🔍 Consulta 3: Com agregação (a que falha)")
            query3 = f'''
            from(bucket: "{bucket}")
              |> range(start: -5m)
              |> filter(fn: (r) => r._measurement == "page_analytics")
              |> filter(fn: (r) => r._field == "permanencia_segundos")
              |> group(columns: ["page_type"])
              |> aggregateWindow(every: 30s, fn: mean, createEmpty: false)
            '''
            
            try:
                result = query_api.query(query3)
                count = 0
                for table in result:
                    for record in table.records:
                        count += 1
                        print(f"   Agregação {count}:")
                        print(f"     Time: {record.get_time()}")
                        print(f"     Page Type: {record.values.get('page_type')}")
                        print(f"     Value: {record.get_value()}")
                        
                print(f"   ✅ Consulta 3 OK - {count} registros agregados")
            except Exception as e:
                print(f"   ❌ Consulta 3 falhou: {str(e)}")
                
            # 4. Consulta simplificada (sem agregação)
            print("\n🔍 Consulta 4: Simplificada (sem agregação)")
            query4 = f'''
            from(bucket: "{bucket}")
              |> range(start: -5m)
              |> filter(fn: (r) => r._measurement == "page_analytics")
              |> limit(n: 10)
            '''
            
            try:
                result = query_api.query(query4)
                count = 0
                for table in result:
                    for record in table.records:
                        count += 1
                        print(f"   Simple {count}: {record.get_field()} = {record.get_value()}")
                        
                        if count >= 3:
                            break
                    if count >= 3:
                        break
                        
                print(f"   ✅ Consulta 4 OK - {count} registros simples")
            except Exception as e:
                print(f"   ❌ Consulta 4 falhou: {str(e)}")
            
            print("\n" + "=" * 50)
            print("🎯 TESTE DE CONSULTAS CONCLUÍDO")
            
    except Exception as e:
        print(f"❌ Erro geral: {str(e)}")

if __name__ == "__main__":
    test_specific_queries()